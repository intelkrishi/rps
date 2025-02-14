/*********************************************************************
 * Copyright (c) Intel Corporation 2021
 * SPDX-License-Identifier: Apache-2.0
 **********************************************************************/
// ./routes/index.js
import adminRouter from './admin/index'
import { Router, Request, Response } from 'express'

const router: Router = Router()

const tenantMiddleware = (req, res, next): void => {
  req.tenantId = ''
  req.next()
}

router.use('/admin', tenantMiddleware, adminRouter)

router.get('/', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Connected!' })
})

export default router
