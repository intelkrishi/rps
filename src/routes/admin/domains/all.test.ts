import { createSpyObj } from '../../../test/helper/jest'
import { getAllDomains } from './all'

describe('Domains - All', () => {
  let resSpy
  let req
  beforeEach(() => {
    resSpy = createSpyObj('Response', ['status', 'json', 'end', 'send'])
    req = {
      db: { domains: { get: jest.fn() } },
      query: { }
    }
    jest.spyOn(req.db.domains, 'get').mockResolvedValue([])
    resSpy.status.mockReturnThis()
    resSpy.json.mockReturnThis()
    resSpy.send.mockReturnThis()
  })
  it('should get all', async () => {
    await getAllDomains(req, resSpy)
    expect(resSpy.status).toHaveBeenCalledWith(200)
  })

  it('should get all with req.query.$count as 1', async () => {
    req.db.domains.getCount = jest.fn().mockImplementation().mockResolvedValue(123)
    req.query.$count = 1
    await getAllDomains(req, resSpy)
    expect(resSpy.status).toHaveBeenCalledWith(200)
  })

  it('should set status to 500 if error occurs', async () => {
    req.db.domains.getCount = jest.fn().mockImplementation(() => {
      throw new TypeError('fake error')
    })
    req.query.$count = 1
    await getAllDomains(req, resSpy)
    expect(resSpy.status).toHaveBeenCalledWith(500)
  })
})
