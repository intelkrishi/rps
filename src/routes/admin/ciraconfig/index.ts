/*********************************************************************
 * Copyright (c) Intel Corporation 2021
 * SPDX-License-Identifier: Apache-2.0
 **********************************************************************/

import { Router } from 'express'
import { allCiraConfigs } from './all'
import { getCiraConfig } from './get'
import { createCiraConfig } from './create'
import { editCiraConfig } from './edit'
import { deleteCiraConfig } from './delete'
import { ciraInsertValidator, ciraUpdateValidator } from './ciraValidator'
import { odataValidator } from '../odataValidator'
import validateMiddleware from '../../../middleware/validate'
const CiraConfigRouter: Router = Router()

CiraConfigRouter.get('/', odataValidator(), validateMiddleware, allCiraConfigs)
CiraConfigRouter.get('/:ciraConfigName', getCiraConfig)
CiraConfigRouter.post('/', ciraInsertValidator(), validateMiddleware, createCiraConfig)
CiraConfigRouter.patch('/', ciraUpdateValidator(), validateMiddleware, editCiraConfig)
CiraConfigRouter.delete('/:ciraConfigName', deleteCiraConfig)

export default CiraConfigRouter
