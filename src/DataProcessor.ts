/*********************************************************************
 * Copyright (c) Intel Corporation 2019
 * SPDX-License-Identifier: Apache-2.0
 * Author: Madhavi Losetty
 * Description: Process client data and gets response for desired action
 **********************************************************************/
import * as WebSocket from 'ws'

import { ILogger } from './interfaces/ILogger'
import { IDataProcessor } from './interfaces/IDataProcessor'
import { ClientMsg, ClientAction, ClientMethods } from './models/RCS.Config'
import { ClientActions } from './ClientActions'
import { SignatureHelper } from './utils/SignatureHelper'
import Logger from './Logger'
import { IConfigurator } from './interfaces/IConfigurator'
import { RPSError } from './utils/RPSError'
import { ClientResponseMsg } from './utils/ClientResponseMsg'
import { IValidator } from './interfaces/IValidator'
import { CertManager } from './CertManager'
import { AMT, Common } from '@open-amt-cloud-toolkit/wsman-messages'
import { HttpHandler } from './HttpHandler'
import { parse, HttpZResponseModel } from 'http-z'
import { devices } from './WebSocketListener'

export class DataProcessor implements IDataProcessor {
  readonly clientActions: ClientActions
  amt: AMT.Messages
  httpHandler: HttpHandler
  constructor (
    private readonly logger: ILogger,
    private readonly signatureHelper: SignatureHelper,
    private readonly configurator: IConfigurator,
    readonly validator: IValidator,
    private readonly certManager: CertManager,
    private readonly responseMsg: ClientResponseMsg
  ) {
    this.clientActions = new ClientActions(new Logger('ClientActions'), configurator, certManager, signatureHelper, responseMsg, validator)
    this.amt = new AMT.Messages()
    this.httpHandler = new HttpHandler()
  }

  /**
     * @description Process client data and gets response for desired action
     * @param {WebSocket.Data} message the message coming in over the websocket connection
     * @param {string} clientId Id to keep track of connections
     * @returns {RCSMessage} returns configuration message
     */
  async processData (message: WebSocket.Data, clientId: string): Promise<ClientMsg | null> {
    try {
      let clientMsg: ClientMsg = null

      try {
        clientMsg = this.validator.parseClientMsg(message, clientId)
      } catch (parseErr) {
        throw new RPSError(parseErr)
      }
      switch (clientMsg.method) {
        case ClientMethods.ACTIVATION: {
          return await this.activateDevice(clientMsg, clientId)
        }
        case ClientMethods.DEACTIVATION: {
          return await this.deactivateDevice(clientMsg, clientId)
        }
        case ClientMethods.RESPONSE: {
          return await this.handleResponse(clientMsg, clientId)
        }
        case ClientMethods.HEARTBEAT: {
          return await this.heartbeat(clientMsg, clientId)
        }
        case ClientMethods.MAINTENANCE: {
          return await this.maintainDevice(clientMsg, clientId)
        }
        default: {
          const uuid = clientMsg.payload.uuid ? clientMsg.payload.uuid : devices[clientId].ClientData.payload.uuid
          throw new RPSError(`Device ${uuid} Not a supported method received from AMT device`)
        }
      }
    } catch (error) {
      this.logger.error(`${clientId} : Failed to process data - ${error.message}`)
      if (error instanceof RPSError) {
        return this.responseMsg.get(clientId, null, 'error', 'failed', error.message)
      } else {
        this.responseMsg.get(clientId, null, 'error', 'failed', 'request failed')
      }
    }
  }

  async activateDevice (clientMsg: ClientMsg, clientId: string): Promise<ClientMsg> {
    this.logger.debug(`ProcessData: Parsed Message received from device ${clientMsg.payload.uuid}: ${JSON.stringify(clientMsg, null, '\t')}`)

    await this.validator.validateActivationMsg(clientMsg, clientId) // Validate the activation message payload

    // Makes the first wsman call
    const clientObj = devices[clientId]
    this.setConnectionParams(clientId)
    if ((clientObj.action === ClientAction.ADMINCTLMODE || clientObj.action === ClientAction.CLIENTCTLMODE) && !clientMsg.payload.digestRealm && !clientObj.activationStatus.missingMebxPassword) {
      const xmlRequestBody = this.amt.GeneralSettings(AMT.Methods.GET)
      const data = this.httpHandler.wrapIt(xmlRequestBody, clientObj.connectionParams)
      return this.responseMsg.get(clientId, data, 'wsman', 'ok')
    } else {
      const response = await this.clientActions.buildResponseMessage(clientMsg, clientId)
      return response
    }
  }

  async deactivateDevice (clientMsg: ClientMsg, clientId: string): Promise<ClientMsg> {
    const clientObj = devices[clientId]
    this.logger.debug(`ProcessData: Parsed DEACTIVATION Message received from device ${clientMsg.payload.uuid}: ${JSON.stringify(clientMsg, null, '\t')}`)
    await this.validator.validateDeactivationMsg(clientMsg, clientId) // Validate the deactivation message payload
    this.setConnectionParams(clientId, 'admin', clientMsg.payload.password, clientMsg.payload.uuid)
    const xmlRequestBody = this.amt.SetupAndConfigurationService(AMT.Methods.UNPROVISION, null, 2)
    const data = this.httpHandler.wrapIt(xmlRequestBody, clientObj.connectionParams)
    return this.responseMsg.get(clientId, data, 'wsman', 'ok')
  }

  async handleResponse (clientMsg: ClientMsg, clientId: string): Promise<ClientMsg> {
    const clientObj = devices[clientId]
    const payload = clientObj.ClientData.payload
    const message = parse(clientMsg.payload) as HttpZResponseModel
    if (message.statusCode === 401) {
      // For Digest authentication, RPS first receives 401 unauthorized error.
      clientObj.connectionParams.digestChallenge = this.handleAuth(message)
      clientMsg.payload = message
    } else if (message.statusCode === 200) {
      this.logger.debug(`Device ${payload.uuid} wsman response ${message.statusCode}: ${JSON.stringify(clientMsg.payload, null, '\t')}`)
      clientMsg.payload = message
    } else {
      this.logger.debug(`Device ${payload.uuid} wsman response ${message.statusCode}: ${JSON.stringify(clientMsg.payload, null, '\t')}`)
      clientMsg.payload = message
      if (clientObj.action !== ClientAction.CIRACONFIG) {
        throw new RPSError(`Device ${payload.uuid} activation failed. Bad wsman response from AMT device`)
      }
    }
    return await this.clientActions.buildResponseMessage(clientMsg, clientId, this.httpHandler)
  }

  async heartbeat (clientMsg: ClientMsg, clientId: string): Promise<ClientMsg> {
    const clientObj = devices[clientId]
    const currentTime = new Date().getTime()
    if (currentTime >= clientObj.delayEndTime) {
      return await this.clientActions.buildResponseMessage(clientMsg, clientId, this.httpHandler)
    } else {
      await new Promise(resolve => setTimeout(resolve, 5000)) // TODO: make configurable rate if required by customers
      return this.responseMsg.get(clientId, null, 'heartbeat_request', 'heartbeat')
    }
  }

  async maintainDevice (clientMsg: ClientMsg, clientId: string): Promise<ClientMsg> {
    this.logger.debug(`ProcessData: Parsed Maintenance message received from device ${clientMsg.payload.uuid}: ${JSON.stringify(clientMsg, null, '\t')}`)
    await this.validator.validateMaintenanceMsg(clientMsg, clientId)
    this.setConnectionParams(clientId, 'admin', clientMsg.payload.password, clientMsg.payload.uuid)
    return await this.clientActions.buildResponseMessage(clientMsg, clientId, this.httpHandler)
  }

  handleAuth (message: HttpZResponseModel): Common.Models.DigestChallenge {
    const found = message.headers.find(item => item.name === 'Www-Authenticate')
    if (found != null) {
      return this.httpHandler.parseAuthenticateResponseHeader(found.value)
    }
    return null
  }

  setConnectionParams (clientId: string, username: string = null, password: string = null, uuid: string = null): void {
    const clientObj = devices[clientId]
    clientObj.connectionParams = {
      port: 16992,
      guid: uuid ?? clientObj.ClientData.payload.uuid,
      username: username ?? clientObj.ClientData.payload.username,
      password: password ?? clientObj.ClientData.payload.password
    }
  }
}
