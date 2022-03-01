/*********************************************************************
* Copyright (c) Intel Corporation 2019
* SPDX-License-Identifier: Apache-2.0
* Description: signiture helper functions for RCS
**********************************************************************/

import * as crypto from 'crypto'
import { NodeForge } from '../NodeForge'

export class SignatureHelper {
  private readonly nodeForge: NodeForge

  constructor (nodeForge: NodeForge) {
    this.nodeForge = nodeForge
  }

  /**
    * @description Signs the concatenated nonce with the private key of the provisioning certificate and encodes as base64
    * @param {any} message Message to be signed
    * @param {any} key Private key of provisioning certificate
    * @returns {string} Returns the signed string
    */
  public signString (message: any, key: any): string {
    try {
      const signer = crypto.createSign('sha256')
      signer.update(message)
      const sign = signer.sign(this.nodeForge.privateKeyToPem(key), 'base64')
      return sign
    } catch (e) {
      throw new Error('Unable to create Digital Signature')
    }
  }

  /**
    * @description Verification check that the digital signature is correct.  Only used for debug
    * @param {string} message Message to be checked
    * @param {any} cert Certificate used to sign
    * @param {string} sign Signature used to sign
    * @returns {boolean} True = pass, False = fail
    */
  public verifyString (message: string, cert: any, sign: string): boolean {
    const verify = crypto.createVerify('sha256')
    verify.update(message)
    const ver = verify.verify(this.nodeForge.pkiCertificateToPem(cert), sign, 'base64')
    return ver
  }

  /**
    * @description creates a md5 hash of the data provided
    * @param {string} data to be hashed
    * @returns {string} returns a hex md5 hash of data
    */
  public static createMd5Hash (data: string): string {
    return crypto.createHash('md5').update(data).digest('hex')
  }
}
