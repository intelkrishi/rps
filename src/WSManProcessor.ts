/*********************************************************************
 * Copyright (c) Intel Corporation 2019
 * SPDX-License-Identifier: Apache-2.0
 * Author: Madhavi Losetty
 * Description:
 **********************************************************************/
import { ILogger } from './interfaces/ILogger'
import { ClientResponseMsg as ResponseMessage } from './utils/ClientResponseMsg'
import { ClientMsg, Payload, ClientObject, SocketConnection } from './models/RCS.Config'

import WSComm = require('./amt-libraries/amt-wsman-comm')
import WSMan = require('./amt-libraries/amt-wsman')
import AMT = require('./amt-libraries/amt')
import { devices } from './WebSocketListener'

export class WSManProcessor {
  cache: any

  constructor (
    private readonly logger: ILogger,
    private readonly responseMsg: ResponseMessage
  ) {
    this.cache = {}
  }

  /**
   * @description parse a wsman response and return appropriate json
   * @param {any} wsManResponseXML wsman response xml received from PPC
   * @param {string} clientId Id to keep track of connections
   * @param {string} statusCode
   * @returns {string} json message
   */
  parseWsManResponseXML (wsManResponseXML: any, clientId: string, statusCode: string): any {
    const clientObj = devices[clientId]
    try {
      const amtstack = this.getAmtStack(clientId)
      amtstack.wsman.comm.socketAccumulator = ''
      amtstack.wsman.comm.socketHeader = null
      amtstack.wsman.comm.socketData = ''

      amtstack.wsman.comm.xxOnSocketData(wsManResponseXML)
      if (statusCode === '401') {
        amtstack.wsman.comm.xxOnSocketConnected()
        if (clientObj.payload) {
          const payload = clientObj.payload
          clientObj.payload = null
          return this.responseMsg.get(clientId, payload, 'wsman', 'ok', 'alls good!')
        }
      } else {
        if (clientObj.payload) {
          const response = clientObj.payload
          clientObj.payload = null
          return response
        }
      }
    } catch {
      this.logger.error(`${clientId} : Failed to parse response data`)
    }
    return null
  }

  /**
  * @description add cert chain to AMT
  * @param {any} cert
  * @param {boolean} leaf
  * @param {boolean} root
  * @param {string} clientId
  */
  async getCertChainWSManResponse (cert: any, leaf: boolean, root: boolean, clientId: string): Promise<void> {
    const amtstack = this.getAmtStack(clientId)
    const clientObj = devices[clientId]
    await amtstack.IPS_HostBasedSetupService_AddNextCertInChain(cert, leaf, root, (stack, name, jsonResponse, status) => {
      if (status !== 200) {
        this.logger.error(`AddNextCertInChain error, status=${status}`)
        clientObj.payload = status
      } else if (jsonResponse.Body.ReturnValue !== 0) {
        this.logger.error(`AddNextCertInChain error: ${jsonResponse.Body.ReturnValue}`)
        clientObj.payload = jsonResponse
      } else {
        clientObj.payload = jsonResponse
      }
    })
  }

  /**
  * @description add cert chain to AMT
  * @param {any} cert
  * @param {boolean} leaf
  * @param {boolean} root
  * @param {string} clientId
  */
  async setupACM (clientId: string, password: any, nonce: any, signature: any): Promise<void> {
    const clientObj = devices[clientId]
    const amtstack = this.getAmtStack(clientId)
    await amtstack.IPS_HostBasedSetupService_AdminSetup(2, password, nonce, 2, signature, (stack, name, jsonResponse, status) => {
      if (status !== 200) {
        this.logger.error(`Error, AdminSetup status: ${status}`)
      } else if (jsonResponse.Body.ReturnValue !== 0) {
        clientObj.payload = jsonResponse
      } else {
        clientObj.payload = jsonResponse
      }
    })
  }

  /**
  * @description To activate AMT in client control mode
  * @param {string} clientId
  * @param {any} password
  */
  async setupCCM (clientId: string, password: any): Promise<void> {
    const clientObj = devices[clientId]
    const amtstack = this.getAmtStack(clientId)
    await amtstack.IPS_HostBasedSetupService_Setup(2, password, null, null, null, null, (stack, name, jsonResponse, status) => {
      if (status !== 200) {
        this.logger.error(`Failed to activate in client control mode.status: ${status}`)
      } else if (jsonResponse.Body.ReturnValue !== 0) {
        clientObj.payload = jsonResponse
      } else {
        clientObj.payload = jsonResponse
      }
    })
  }

  /**
  * @description To activate AMT in client control mode
  * @param {string} clientId
  * @param {any} password
  */
  async addWifiConfig (clientId: string, wifiEndpoint: any, wifiEndpointSettings: any): Promise<void> {
    const clientObj = devices[clientId]
    const amtstack = this.getAmtStack(clientId)
    await amtstack.AMT_WiFiPortConfigurationService_AddWiFiSettings(wifiEndpoint, wifiEndpointSettings, null, null, null, (stack, name, jsonResponse, status) => {
      if (status === 200) {
        clientObj.payload = jsonResponse
        this.logger.debug('Wifi profile successfully added.')
      } else {
        this.logger.error('Failed to add wifi profile.')
      }
    })
  }

  async setWiFiPort (clientId: string, value: number): Promise<void> {
    const clientObj = devices[clientId]
    const amtstack = this.getAmtStack(clientId)
    await amtstack.CIM_WiFiPort_RequestStateChange(value, null, async () => {
      await amtstack.Get('CIM_WiFiPort', (stack, name, jsonResponse, status) => {
        if (status === 200) {
          clientObj.payload = jsonResponse
        } else {
          this.logger.error(`Failed to fully unconfigure AMT, status ${status}`)
        }
      })
    })
  }

  async deactivateACM (clientId: string): Promise<void> {
    const clientObj = devices[clientId]
    const amtstack = this.getAmtStack(clientId)

    await amtstack.AMT_SetupAndConfigurationService_Unprovision(2, (stack, name, jsonResponse, status) => {
      if (status !== 200) {
        this.logger.error(`Failed to fully unconfigure AMT, status ${status}`)
      } else if (jsonResponse.Body.ReturnValue !== 0) {
        clientObj.payload = jsonResponse
      } else {
        this.logger.debug('AMT fully unprovisioned.')
        clientObj.payload = jsonResponse
      }
    })
  }

  /**
   * @description Create wsman stack
   * @param {string} clientId Id to keep track of connections
   * @returns {any} wsman stack
   */
  getAmtStack (clientId: string, username?: string, password?: string): any {
    let payload: Payload
    const clientObj = devices[clientId]

    try {
      if (typeof this.cache[clientId] === 'undefined') {
        this.logger.debug(`getAmtStack: clientId: ${clientId}, setting up communication`)

        payload = clientObj.ClientData.payload
        const SetupCommunication = (host: string, port: number): SocketConnection => {
          clientObj.socketConn = { socket: clientObj.ClientSocket, state: 1 }
          clientObj.socketConn.close = (): void => {
            if (clientObj.socketConn.onStateChange) {
              clientObj.socketConn.onStateChange(clientObj.ClientSocket, 0)
            }
          }
          clientObj.socketConn.write = (data: any): void => {
            const wsmanJsonPayload: ClientMsg = this.responseMsg.get(clientId, data, 'wsman', 'ok', 'alls good!')
            this.logger.debug(`ClientResponseMsg: Message sending to device ${payload.uuid}: ${JSON.stringify(wsmanJsonPayload, null, '\t')}`)
            clientObj.ClientSocket?.send(JSON.stringify(wsmanJsonPayload))
          }
          return clientObj.socketConn
        }
        const wsmanUsername: string = username || payload.username
        const wsmanPassword: string = password || payload.password
        const wsstack = WSMan(WSComm, payload.uuid, 16992, wsmanUsername, wsmanPassword, 0, null, SetupCommunication)
        this.cache[clientId] = new AMT(wsstack)
      } else {
        this.logger.debug(`getAmtStack: clientId: ${clientId}, communication was already setup`)
      }
    } catch (error) {
      this.logger.error(`${clientId} : Error while creating the wsman stack`)
    }
    return this.cache[clientId]
  }

  /**
   * @description Create wsman message
   * @param {string} clientId Id to keep track of connections
   * @param {string} action WSMan action
   */
  async batchEnum (clientId: string, action: string, amtuser?: string, amtpass?: string, tag: string = null): Promise<void> {
    const clientObj = devices[clientId]
    try {
      const amtstack = this.getAmtStack(clientId, amtuser, amtpass)
      await amtstack.BatchEnum('', [action], (stack, name, jsonResponse, status) => {
        if (status !== 200) {
          this.logger.error('Request failed during hardware_info BatchEnum Exec.')
        } else {
          this.logger.debug(`batchEnum request succeeded for clientId: ${clientId}, action:${action}.`)
        }
        clientObj.payload = jsonResponse
      }, tag)
      if (clientObj.socketConn?.onStateChange && clientObj.readyState == null) {
        clientObj.readyState = 2
        clientObj.socketConn.onStateChange(clientObj.ClientSocket, clientObj.readyState)
      }
    } catch (error) {
      this.logger.error(`${clientId} : Failed to get the wsman for ${action}`)
    }
  }

  /**
   * @description Create wsman get message
   * @param {string} clientId Id to keep track of connections
   * @param {string} action WSMan action
   */
  async getWSManResponse (clientId: string, action: string, amtuser?: string, amtpass?: string): Promise<void> {
    const clientObj = devices[clientId]
    try {
      const amtstack = this.getAmtStack(clientId, amtuser, amtpass)
      await amtstack.Get(action, (stack, name, jsonResponse, status) => {
        if (status !== 200) {
          this.logger.error(`Get request failed during get for clientId: ${clientId}, action:${action}.`)
        } else {
          this.logger.debug(`Get request succeeded for clientId: ${clientId}, action:${action}.`)
        }
        clientObj.payload = jsonResponse
        this.logger.debug(`get request for clientId: ${clientId}, action:${action}, status: ${status} response: ${JSON.stringify(jsonResponse, null, '\t')}`)
      }
      )
      if (clientObj.socketConn?.onStateChange && clientObj.readyState == null) {
        this.logger.debug('updating ready state')
        clientObj.readyState = 2
        clientObj.socketConn.onStateChange(clientObj.ClientSocket, clientObj.readyState)
      }
    } catch (error) {
      this.logger.error(`${clientId} : Failed to get the wsman for ${action}, error: ${JSON.stringify(error)}`)
    }
  }

  async put (clientId: string, action: string, obj: any, amtuser?: string, amtpass?: string, noselectors: boolean = false): Promise<void> {
    const clientObj = devices[clientId]
    try {
      const amtstack = this.getAmtStack(clientId, amtuser, amtpass)
      const callback = (stack, name, jsonResponse, status): void => {
        if (status !== 200) {
          this.logger.error(`Put request failed during put for clientId: ${clientId}, action:${action}.`)
        } else {
          this.logger.debug(`Put request succeeded for clientId: ${clientId}, action:${action}.`)
        }
        clientObj.payload = jsonResponse
      }
      if (noselectors) {
        await amtstack.Put(action, obj, callback)
      } else {
        await amtstack.Put(action, obj, callback, 0, 1, obj)
      }
      if (clientObj.socketConn?.onStateChange && clientObj.readyState == null) {
        this.logger.debug('updating ready state')
        clientObj.readyState = 2
        clientObj.socketConn.onStateChange(clientObj.ClientSocket, clientObj.readyState)
      }
    } catch (error) {
      this.logger.error(`${clientId} : Failed to put wsman request for ${action}, error: ${JSON.stringify(error)}`)
    }
  }

  async delete (clientId: string, action: string, deleteObj: any, amtuser?: string, amtpass?: string): Promise<void> {
    const clientObj: ClientObject = devices[clientId]
    try {
      const amtstack = this.getAmtStack(clientId, amtuser, amtpass)
      await amtstack.Delete(action, deleteObj, (stack, name, jsonResponse, status) => {
        if (status !== 200) {
          this.logger.warn(`Delete request failed during delete for clientId: ${clientId}, action:${action}.`)
        } else {
          this.logger.debug(`Delete request succeeded for clientId: ${clientId}, action:${action}.`)
        }
        clientObj.payload = jsonResponse
      })
      if (clientObj.socketConn?.onStateChange && clientObj.readyState == null) {
        this.logger.debug('updating ready state')
        clientObj.readyState = 2
        clientObj.socketConn.onStateChange(clientObj.ClientSocket, clientObj.readyState)
      }
    } catch (error) {
      this.logger.error(`${clientId} : Failed to delete the wsman for ${action}, error: ${JSON.stringify(error)}`)
    }
  }

  async execute (clientId: string, name: string, method: string, args: any, selectors: any, amtuser?: string, amtpass?: string): Promise<void> {
    const clientObj: ClientObject = devices[clientId]
    try {
      const amtstack = this.getAmtStack(clientId, amtuser, amtpass)
      await amtstack.Exec(name, method, args, (stack, name, jsonResponse, status) => {
        if (status !== 200) {
          this.logger.error(`Execute request failed during execute for clientId: ${clientId}, action:${name}.`)
        } else {
          this.logger.debug(`Execute request succeeded for clientId: ${clientId}, action:${name}.`)
        }
        clientObj.payload = jsonResponse
      }, null, 0, selectors)

      if (clientObj.socketConn?.onStateChange && clientObj.readyState == null) {
        this.logger.debug('updating ready state')
        clientObj.readyState = 2
        clientObj.socketConn.onStateChange(clientObj.ClientSocket, clientObj.readyState)
      }
    } catch (error) {
      this.logger.error(`${clientId} : Failed to execute the wsman for ${name}, error: ${JSON.stringify(error)}`)
    }
  }

  // TBD: Needs to refactor this file as most of the methods share the same lines of code.
  async create (clientId: string, name: string, putobj: any, tag: any = null, amtuser?: string, amtpass?: string): Promise<void> {
    const clientObj = devices[clientId]
    try {
      const amtstack = this.getAmtStack(clientId, amtuser, amtpass)
      await amtstack.Create(name, putobj, (stack, name, jsonResponse, status) => {
        if (status !== 200) {
          this.logger.error(`Create request failed for clientId: ${clientId}, action:${name}.`)
        } else {
          this.logger.debug(`Create request succeeded for clientId: ${clientId}, action:${name}.`)
        }
        clientObj.payload = jsonResponse
      }, tag, 0)

      if (clientObj.socketConn?.onStateChange && clientObj.readyState == null) {
        this.logger.debug('updating ready state')
        clientObj.readyState = 2
        clientObj.socketConn.onStateChange(clientObj.ClientSocket, clientObj.readyState)
      }
    } catch (error) {
      this.logger.error(`${clientId} : Failed to execute the wsman for ${name}, error: ${JSON.stringify(error)}`)
    }
  }
}
