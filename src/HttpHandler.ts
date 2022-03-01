/*********************************************************************
* Copyright (c) Intel Corporation 2021
* SPDX-License-Identifier: Apache-2.0
**********************************************************************/

import { createHash } from 'crypto'
import * as xml2js from 'xml2js'
import { DigestChallenge } from '@open-amt-cloud-toolkit/wsman-messages/models/common'
import Logger from './Logger'
import { connectionParams } from './models/RCS.Config'

export class HttpHandler {
  authResolve: any
  isAuthInProgress: any
  // The purpose of this directive is to allow the server to detect request replays by maintaining its own copy of this count.
  // if the same nonceCounter-value is seen twice, then the request is a replay
  nonceCounter: number = 1
  stripPrefix: any
  parser: any
  logger: Logger
  constructor () {
    this.stripPrefix = xml2js.processors.stripPrefix
    this.parser = new xml2js.Parser({ ignoreAttrs: true, mergeAttrs: false, explicitArray: false, tagNameProcessors: [this.stripPrefix], valueProcessors: [xml2js.processors.parseNumbers, xml2js.processors.parseBooleans] })
    this.logger = new Logger('HttpHandler')
  }

  wrapIt (data: string, connectionParams: connectionParams): string {
    try {
      const url = '/wsman'
      const action = 'POST'
      let message: string = `${action} ${url} HTTP/1.1\r\n`
      if (data == null) {
        return null
      }
      if (connectionParams.digestChallenge != null) {
        // Prepare an Authorization request header from the 401 unauthorized response from AMT
        let responseDigest = null
        // console nonce should be a unique opaque quoted string
        connectionParams.consoleNonce = Math.random().toString(36).substring(7)
        const HA1 = this.hashIt(`${connectionParams.username}:${connectionParams.digestChallenge.realm}:${connectionParams.password}`)
        const HA2 = this.hashIt(`${action}:${url}`)
        responseDigest = this.hashIt(`${HA1}:${connectionParams.digestChallenge.nonce}:${this.nonceCounter}:${connectionParams.consoleNonce}:${connectionParams.digestChallenge.qop}:${HA2}`)
        const authorizationRequestHeader = this.digestIt({
          username: connectionParams.username,
          realm: connectionParams.digestChallenge.realm,
          nonce: connectionParams.digestChallenge.nonce,
          uri: url,
          qop: connectionParams.digestChallenge.qop,
          response: responseDigest,
          nc: this.nonceCounter++,
          cnonce: connectionParams.consoleNonce
        })
        message += `Authorization: ${authorizationRequestHeader}\r\n`
      }
      // Use Chunked-Encoding
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      message += Buffer.from([
        `Host: ${connectionParams.guid}:${connectionParams.port}`,
        'Transfer-Encoding: chunked',
        '',
        data.length.toString(16).toUpperCase(),
        data,
        0,
        '\r\n'
      ].join('\r\n'), 'utf8')
      return message
    } catch (err) {
      this.logger.error('httpHandler unable to create hashed string: ', err.message)
      return null
    }
  }

  hashIt (data: string): string {
    return createHash('md5').update(data).digest('hex')
  }

  // Prepares Authorization Request Header
  digestIt (params: object): string {
    const paramNames = []
    for (const i in params) {
      paramNames.push(i)
    }
    return `Digest ${paramNames.reduce((s1, ii) => `${s1},${ii}="${params[ii]}"`, '').substring(1)}`
  }

  parseAuthenticateResponseHeader = (value: string): DigestChallenge => {
    const params = value.replace('Digest realm', 'realm').split(',')
    const challengeParams = params.reduce((obj: DigestChallenge, s: string) => {
      const parts = s.split('=')
      obj[parts[0].trim()] = parts[1].replace(/"/g, '')
      return obj
    }, {})
    return challengeParams
  }

  parseXML (xmlBody: string): any {
    let wsmanResponse: any
    this.parser.parseString(xmlBody, (err, result) => {
      if (err) {
        this.logger.error('failed to parse XML :', err)
        wsmanResponse = null
      } else {
        wsmanResponse = result
      }
    })
    return wsmanResponse
  }
}
