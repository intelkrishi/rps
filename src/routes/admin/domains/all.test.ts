import { createSpyObj } from '../../../test/helper/jest'
import { getAllDomains } from './all'

describe('Domains - All', () => {
  let resSpy
  let req
  let reqwithError
  let reqwithCount
  beforeEach(() => {
    resSpy = createSpyObj('Response', ['status', 'json', 'end', 'send'])
    req = {
      db: { domains: { get: jest.fn() } },
      query: { }
    }
    jest.spyOn(req.db.domains, 'get').mockResolvedValue([])
    reqwithError = {
      db: {
        domains: {
          getCount: jest.fn().mockImplementation(() => {
            throw new TypeError('fake error')
          }),
          get: jest.fn()
        }
      },
      query: { $count: 1 }
    }
    jest.spyOn(reqwithError.db.domains, 'get').mockResolvedValue([])
    reqwithCount = {
      db: {
        domains: {
          getCount: jest.fn().mockImplementation().mockResolvedValue(123),
          get: jest.fn()
        }
      },
      query: { $count: 1 }
    }
    jest.spyOn(reqwithCount.db.domains, 'get').mockResolvedValue([])

    resSpy.status.mockReturnThis()
    resSpy.json.mockReturnThis()
    resSpy.send.mockReturnThis()
  })
  it('should get all', async () => {
    await getAllDomains(req, resSpy)
    expect(resSpy.status).toHaveBeenCalledWith(200)
  })

  it('should get all with req.query.$count as 1', async () => {
    await getAllDomains(reqwithCount, resSpy)
    expect(resSpy.status).toHaveBeenCalledWith(200)
  })

  it('should set status to 500 if error occurs', async () => {
    await getAllDomains(reqwithError, resSpy)
    expect(resSpy.status).toHaveBeenCalledWith(500)
  })
})
