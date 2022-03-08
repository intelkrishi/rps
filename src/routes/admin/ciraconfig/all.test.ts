import { createSpyObj } from '../../../test/helper/jest'
import { allCiraConfigs } from './all'

describe('CIRA Config - All', () => {
  let resSpy
  let req
  beforeEach(() => {
    resSpy = createSpyObj('Response', ['status', 'json', 'end', 'send'])
    req = {
      db: { ciraConfigs: { get: jest.fn() } },
      query: { }
    }
    jest.spyOn(req.db.ciraConfigs, 'get').mockResolvedValue([])
    resSpy.status.mockReturnThis()
    resSpy.json.mockReturnThis()
    resSpy.send.mockReturnThis()
  })

  it('should get all', async () => {
    await allCiraConfigs(req, resSpy)
    expect(resSpy.status).toHaveBeenCalledWith(200)
  })

  it('should get all with req.query.$count as 1', async () => {
    req.db.ciraConfigs.getCount = jest.fn().mockImplementation().mockResolvedValue(123)
    req.query.$count = 1
    await allCiraConfigs(req, resSpy)
    expect(resSpy.status).toHaveBeenCalledWith(200)
  })

  it('should set status to 500 if error occurs', async () => {
    req.db.ciraConfigs.getCount = jest.fn().mockImplementation(() => {
      throw new TypeError('fake error')
    })
    req.query.$count = 1
    await allCiraConfigs(req, resSpy)
    expect(resSpy.status).toHaveBeenCalledWith(500)
  })
})
