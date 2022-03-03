import { createSpyObj } from '../../../test/helper/jest'
import { allProfiles } from './all'

describe('Wireless - All', () => {
  let resSpy
  let req
  let reqwithError
  let reqwithCount
  beforeEach(() => {
    resSpy = createSpyObj('Response', ['status', 'json', 'end', 'send'])
    req = {
      db: { wirelessProfiles: { get: jest.fn() } },
      query: { }
    }
    jest.spyOn(req.db.wirelessProfiles, 'get').mockResolvedValue([])
    reqwithError = {
      db: {
        wirelessProfiles: {
          getCount: jest.fn().mockImplementation(() => {
            throw new TypeError('fake error')
          }),
          get: jest.fn()
        }
      },
      query: { $count: 1 }
    }
    jest.spyOn(reqwithError.db.wirelessProfiles, 'get').mockResolvedValue([])
    reqwithCount = {
      db: {
        wirelessProfiles: {
          getCount: jest.fn().mockImplementation().mockResolvedValue(123),
          get: jest.fn()
        }
      },
      query: { $count: 1 }
    }
    jest.spyOn(reqwithCount.db.wirelessProfiles, 'get').mockResolvedValue([])

    resSpy.status.mockReturnThis()
    resSpy.json.mockReturnThis()
    resSpy.send.mockReturnThis()
  })

  it('should get all', async () => {
    await allProfiles(req, resSpy)
    expect(resSpy.status).toHaveBeenCalledWith(200)
  })

  it('should get all with wirelessConfigs length > 0', async () => {
    jest.spyOn(reqwithCount.db.wirelessProfiles, 'get').mockResolvedValue(['abc'])
    await allProfiles(reqwithCount, resSpy)
    expect(resSpy.status).toHaveBeenCalledWith(200)
  })
  it('should get all with req.query.$count as 1', async () => {
    await allProfiles(reqwithCount, resSpy)
    expect(resSpy.status).toHaveBeenCalledWith(200)
  })

  it('should set status to 500 if error occurs', async () => {
    await allProfiles(reqwithError, resSpy)
    expect(resSpy.status).toHaveBeenCalledWith(500)
  })
})
