/*********************************************************************
* Copyright (c) Intel Corporation 2021
* SPDX-License-Identifier: Apache-2.0
**********************************************************************/
import Logger from '../../../Logger'
import { Request, Response } from 'express'
import { API_RESPONSE, API_UNEXPECTED_EXCEPTION, NETWORK_CONFIG_NOT_FOUND } from '../../../utils/constants'
import { MqttProvider } from '../../../utils/MqttProvider'

export async function getWirelessProfile (req: Request, res: Response): Promise<void> {
  const log = new Logger('getWirelessProfile')
  const { profileName } = req.params
  try {
    const result = await req.db.wirelessProfiles.getByName(profileName)
    if (result == null) {
      MqttProvider.publishEvent('fail', ['getWirelessProfiles'], `Wireless Profile Not Found : ${profileName}`)
      res.status(404).json(API_RESPONSE(null, 'Not Found', NETWORK_CONFIG_NOT_FOUND('Wireless', profileName))).end()
    } else {
      delete result.pskPassphrase
      MqttProvider.publishEvent('success', ['getWirelessProfiles'], `Sent Wireless Profile : ${profileName}`)
      res.status(200).json(API_RESPONSE(result)).end()
    }
  } catch (error) {
    MqttProvider.publishEvent('fail', ['getWirelessProfiles'], `Failed to get wireless profile : ${profileName}`)
    log.error(`Failed to get wireless profile : ${profileName}`, error)
    res.status(500).json(API_RESPONSE(null, null, API_UNEXPECTED_EXCEPTION(`GET ${profileName}`))).end()
  }
}
