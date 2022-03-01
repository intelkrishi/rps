/*********************************************************************
 * Copyright (c) Intel Corporation 2021
 * SPDX-License-Identifier: Apache-2.0
 **********************************************************************/
import { API_RESPONSE, API_UNEXPECTED_EXCEPTION } from '../../../utils/constants'
import Logger from '../../../Logger'
import { AMTDomain, DataWithCount } from '../../../models'
import { MqttProvider } from '../../../utils/MqttProvider'
import { Request, Response } from 'express'

export async function getAllDomains (req: Request, res: Response): Promise<void> {
  const log = new Logger('getAllDomains')
  const top = Number(req.query.$top)
  const skip = Number(req.query.$skip)
  const includeCount = req.query.$count
  try {
    let domains: AMTDomain[] = await req.db.domains.get(top, skip)
    if (domains.length >= 0) {
      domains = domains.map((result: AMTDomain) => {
        delete result.provisioningCert
        delete result.provisioningCertPassword
        return result
      })
    }
    if (includeCount == null || includeCount === 'false') {
      res.status(200).json(API_RESPONSE(domains)).end()
    } else {
      const count: number = await req.db.domains.getCount()
      const dataWithCount: DataWithCount = {
        data: domains,
        totalCount: count
      }
      res.status(200).json(API_RESPONSE(dataWithCount)).end()
    }
    MqttProvider.publishEvent('success', ['getAllDomains'], 'Sent domains')
  } catch (error) {
    MqttProvider.publishEvent('fail', ['getAllDomains'], 'Failed to get all domains')
    log.error('Failed to get all the AMT Domains :', error)
    res.status(500).json(API_RESPONSE(null, null, API_UNEXPECTED_EXCEPTION('GET all Domains'))).end()
  }
}
