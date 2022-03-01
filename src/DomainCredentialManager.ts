/*********************************************************************
 * Copyright (c) Intel Corporation 2019
 * SPDX-License-Identifier: Apache-2.0
 * Description: stores domain certificates
 * Author: Brian Osburn
 **********************************************************************/

import { IDomainCredentialManager } from './interfaces/IDomainCredentialManager'
import { ILogger } from './interfaces/ILogger'
import { IConfigurator } from './interfaces/IConfigurator'
import { IDomainsTable } from './interfaces/database/IDomainsDb'
import { AMTDomain } from './models'

export class DomainCredentialManager implements IDomainCredentialManager {
  private readonly amtDomains: IDomainsTable
  private readonly logger: ILogger
  private readonly configurator: IConfigurator = null

  constructor (logger: ILogger, amtDomains: IDomainsTable, configurator?: IConfigurator) {
    this.amtDomains = amtDomains
    this.logger = logger
    this.configurator = configurator
  }

  /**
     * @description get the provisioning cert storage format for a given domain
     * @param {string} domainSuffix
     * @returns {string} returns path to provisioning cert storage format if domain is found otherwise null
     */
  async getProvisioningCertStorageType (domainSuffix: string): Promise<string> {
    const domain = await this.amtDomains.getDomainByDomainSuffix(domainSuffix)
    let format: string = null
    if (domain?.provisioningCertStorageFormat) {
      format = domain.provisioningCertStorageFormat
    } else {
      this.logger.error(`unable to find provisioning cert storage format for profile ${domainSuffix}`)
    }

    return format
  }

  /**
     * @description get the provisioning cert for a given domain
     * @param {string} domainSuffix
     * @returns {AMTDomain} returns domain object
     */
  async getProvisioningCert (domainSuffix: string): Promise<AMTDomain> {
    const domain = await this.amtDomains.getDomainByDomainSuffix(domainSuffix)
    this.logger.debug(`domain : ${JSON.stringify(domain)}`)
    let certPwd = null
    if (domain?.provisioningCert) {
      if (this.configurator?.secretsManager) {
        certPwd = await this.configurator.secretsManager.getSecretAtPath(`certs/${domain.profileName}`)
        this.logger.debug('Received CertPwd from vault')
        domain.provisioningCert = certPwd.data.CERT
        domain.provisioningCertPassword = certPwd.data.CERT_PASSWORD
      }
    } else {
      this.logger.error(`unable to find provisioning cert for profile ${domainSuffix}`)
    }
    return domain
  }

  /**
    * @description Checks if the AMT domain exists or not
    * @param {string} domainSuffix
    * @returns {boolean} returns true if domain exists otherwise false.
    */
  public async doesDomainExist (domainSuffix: string): Promise<boolean> {
    if (await this.amtDomains.getDomainByDomainSuffix(domainSuffix)) {
      return true
    } else {
      return false
    }
  }
}
