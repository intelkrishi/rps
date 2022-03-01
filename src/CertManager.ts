/*********************************************************************
 * Copyright (c) Intel Corporation 2019
 * SPDX-License-Identifier: Apache-2.0
 * Author: Brian Osburn
 **********************************************************************/

import { pkcs12, pki } from 'node-forge'
import { ILogger } from './interfaces/ILogger'
import Logger from './Logger'
import { AMTKeyUsage, CertAttributes, CertCreationResult, CertificateObject, CertsAndKeys, ProvisioningCertObj } from './models'
import { NodeForge } from './NodeForge'

export class CertManager {
  private readonly nodeForge: NodeForge
  private readonly logger: ILogger
  constructor (logger: Logger, nodeForge: NodeForge) {
    this.logger = logger
    this.nodeForge = nodeForge
  }

  /**
      * @description Sorts the intermediate certificates to properly order the certificate chain
      * @param {CertificateObject} intermediate
      * @param {CertificateObject} root
      * @returns {boolean} Returns true if issuer is from root.  Returns false if issuer is not from root.
      */
  sortCertificate (intermediate: CertificateObject, root: CertificateObject): boolean {
    return intermediate.issuer === root.subject
  }

  /**
   * @description Pulls the provisioning certificate apart and exports each PEM for injecting into AMT.  Only supports certificate chains up to 4 certificates long
   * @param {any} pfxobj Certificate object from convertPfxToObject function
   * @returns {any} Returns provisioning certificate object with certificate chain in proper order and fingerprint
   */
  dumpPfx (pfxobj: CertsAndKeys): { provisioningCertificateObj: ProvisioningCertObj, fingerprint: string } {
    const provisioningCertificateObj: ProvisioningCertObj = {} as ProvisioningCertObj
    const interObj: CertificateObject[] = []
    const leaf: CertificateObject = {} as CertificateObject
    const root: CertificateObject = {} as CertificateObject
    let fingerprint: string
    if (pfxobj.certs?.length > 0) {
      for (let i = 0; i < pfxobj.certs.length; i++) {
        const cert = pfxobj.certs[i]
        let pem = this.nodeForge.pkiCertificateToPem(cert)
        // Need to trim off the BEGIN and END so we just have the raw pem
        pem = pem.replace('-----BEGIN CERTIFICATE-----', '').replace('-----END CERTIFICATE-----', '')
        // pem = pem.replace(/(\r\n|\n|\r)/g, '');
        // Index 0 = Leaf, Root subject.hash will match issuer.hash, rest are Intermediate.
        if (i === 0) {
          leaf.pem = pem
          leaf.subject = cert.subject.hash
          leaf.issuer = cert.issuer.hash
        } else if (cert.subject.hash === cert.issuer.hash) {
          root.pem = pem
          root.subject = cert.subject.hash
          root.issuer = cert.issuer.hash
          const der = this.nodeForge.asn1ToDer(this.nodeForge.pkiCertificateToAsn1(cert)).getBytes()
          const md = this.nodeForge.sha256Create()

          md.update(der)
          fingerprint = md.digest().toHex()
        } else {
          const inter: CertificateObject = {
            pem: pem,
            issuer: cert.issuer.hash,
            subject: cert.subject.hash
          }
          interObj.push(inter)
        }
      }
    }

    // Need to put the certificate PEMs in the correct order before sending to AMT.
    // This currently only supports certificate chains that are no more than 4 certificates long
    provisioningCertificateObj.certChain = []
    // Leaf PEM is first
    provisioningCertificateObj.certChain.push(leaf.pem)
    // Need to figure out which Intermediate PEM is next to the Leaf PEM
    for (let k = 0; k < interObj.length; k++) {
      if (!this.sortCertificate(interObj[k], root)) {
        provisioningCertificateObj.certChain.push(interObj[k].pem)
      }
    }
    // Need to figure out which Intermediate PEM is next to the Root PEM
    for (let l = 0; l < interObj.length; l++) {
      if (this.sortCertificate(interObj[l], root)) {
        provisioningCertificateObj.certChain.push(interObj[l].pem)
      }
    }
    // Root PEM goes in last
    provisioningCertificateObj.certChain.push(root.pem)
    if (pfxobj.keys?.length > 0) {
      for (let i = 0; i < pfxobj.keys.length; i++) {
        const key = pfxobj.keys[i]
        // Just need the key in key format for signing.  Keeping the private key in memory only.
        provisioningCertificateObj.privateKey = key
      }
    }

    return { provisioningCertificateObj, fingerprint }
  }

  /**
     * @description Extracts the provisioning certificate into an object for later manipulation
     * @param {string} pfxb64 provisioning certificate
     * @param {string} passphrase Password to open provisioning certificate
     * @returns {object} Object containing cert pems and private key
     */
  convertPfxToObject (pfxb64: string, passphrase: string): CertsAndKeys {
    const pfxOut: CertsAndKeys = { certs: [], keys: [] }
    const pfxder = Buffer.from(pfxb64, 'base64').toString('binary')
    const asn = this.nodeForge.asn1FromDer(pfxder)
    let pfx: pkcs12.Pkcs12Pfx
    try {
      pfx = this.nodeForge.pkcs12FromAsn1(asn, true, passphrase)
    } catch (e) {
      throw new Error('Decrypting provisioning certificate failed')
    }
    // Get the certs from certbags
    let bags = pfx.getBags({ bagType: this.nodeForge.pkiOidsCertBag })
    for (let i = 0; i < bags[this.nodeForge.pkiOidsCertBag].length; i++) {
      // dump cert into DER
      const cert = bags[this.nodeForge.pkiOidsCertBag][i]
      pfxOut.certs.push(cert.cert)
    }
    // get shrouded key from key bags
    bags = pfx.getBags({ bagType: this.nodeForge.pkcs8ShroudedKeyBag })
    for (let i = 0; i < bags[this.nodeForge.pkcs8ShroudedKeyBag].length; i++) {
      // dump cert into DER
      const cert = bags[this.nodeForge.pkcs8ShroudedKeyBag][i]
      pfxOut.keys.push(cert.key)
    }
    return pfxOut
  }

  generateLeafCertificate (cert: pki.Certificate, keyUsage: AMTKeyUsage): pki.Certificate {
    // Figure out the extended key usages
    if (keyUsage['2.16.840.1.113741.1.2.1'] || keyUsage['2.16.840.1.113741.1.2.2'] || keyUsage['2.16.840.1.113741.1.2.3']) {
      keyUsage.clientAuth = true
    }
    // Create a leaf certificate

    cert.setExtensions([{
      name: 'basicConstraints'
    }, {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    }, keyUsage, {
      name: 'nsCertType',
      client: keyUsage.clientAuth,
      server: keyUsage.serverAuth,
      email: keyUsage.emailProtection,
      objsign: keyUsage.codeSigning
    }, {
      name: 'subjectKeyIdentifier'
    }])

    return cert
  }

  generateRootCertificate (cert: pki.Certificate): pki.Certificate {
    // Create a root certificate
    cert.setExtensions([{
      name: 'basicConstraints',
      cA: true
    }, {
      name: 'nsCertType',
      sslCA: true,
      emailCA: true,
      objCA: true
    }, {
      name: 'subjectKeyIdentifier'
    }])

    return cert
  }

  hex2rstr (hex: string): string {
    let str = ''
    for (let n = 0; n < hex.length; n += 2) {
      str += String.fromCharCode(parseInt(hex.substr(n, 2), 16))
    }
    return str
  }

  amtCertSignWithCAKey (DERKey: string, caPrivateKey: pki.PrivateKey, certAttributes: CertAttributes, issuerAttributes: CertAttributes, extKeyUsage: AMTKeyUsage): CertCreationResult {
    if (!caPrivateKey || caPrivateKey == null) {
      const certAndKey = this.createCertificate(issuerAttributes)
      caPrivateKey = certAndKey.key
    }
    return this.createCertificate(certAttributes, caPrivateKey, DERKey, issuerAttributes, extKeyUsage)
  }

  // Generate a certificate with a set of attributes signed by a rootCert. If the rootCert is omitted, the generated certificate is self-signed.
  createCertificate (certAttributes: CertAttributes, caPrivateKey: pki.PrivateKey = null, DERKey: string = null, issuerAttributes: CertAttributes = null, extKeyUsage: AMTKeyUsage = null): CertCreationResult {
  // Generate a keypair and create an X.509v3 certificate
    let keys
    let cert = this.nodeForge.createCert()
    if (!DERKey) {
      keys = this.nodeForge.rsaGenerateKeyPair(2048)
      cert.publicKey = keys.publicKey
    } else {
      cert.publicKey = this.nodeForge.publicKeyFromPem(`-----BEGIN PUBLIC KEY-----${DERKey}-----END PUBLIC KEY-----`)
    }
    cert.serialNumber = Math.floor((Math.random() * 100000) + 1).toString()
    cert.validity.notBefore = new Date(2018, 0, 1)
    cert.validity.notAfter = new Date(2049, 11, 31)

    const attrs = []
    if (certAttributes.CN) attrs.push({ name: 'commonName', value: certAttributes.CN })
    if (certAttributes.C) attrs.push({ name: 'countryName', value: certAttributes.C })
    if (certAttributes.ST) attrs.push({ shortName: 'ST', value: certAttributes.ST })
    if (certAttributes.O) attrs.push({ name: 'organizationName', value: certAttributes.O })
    cert.setSubject(attrs)

    if (caPrivateKey) {
      // Use root attributes
      const rootattrs = []
      if (issuerAttributes.CN) rootattrs.push({ name: 'commonName', value: issuerAttributes.CN })
      if (issuerAttributes.C) rootattrs.push({ name: 'countryName', value: issuerAttributes.C })
      if (issuerAttributes.ST) rootattrs.push({ shortName: 'ST', value: issuerAttributes.ST })
      if (issuerAttributes.O) rootattrs.push({ name: 'organizationName', value: issuerAttributes.O })
      cert.setIssuer(rootattrs)
      cert = this.generateLeafCertificate(cert, extKeyUsage)
      cert.sign(caPrivateKey, this.nodeForge.sha256Create())
    } else {
      // Use our own attributes
      cert.setIssuer(attrs)
      cert = this.generateRootCertificate(cert)
      cert.sign(keys.privateKey, this.nodeForge.sha256Create())
    }

    return {
      h: Math.random(),
      cert: cert,
      pem: this.nodeForge.pkiCertificateToPem(cert).replace(/(\r\n|\n|\r)/gm, ''),
      certbin: Buffer.from(this.hex2rstr(this.nodeForge.asn1ToDer(this.nodeForge.pkiCertificateToAsn1(cert)).toHex()), 'binary').toString('base64'),
      privateKey: keys?.privateKey,
      privateKeyBin: keys == null ? null : this.nodeForge.privateKeyToPem(keys.privateKey),
      checked: false,
      key: keys?.privateKey
    }
  }
}
