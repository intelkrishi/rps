import { createSpyObj } from '../../../test/helper/jest'
import { getProfile } from './get'

describe('Profiles - Get', () => {
  let resSpy
  let req
  let getByNameSpy: jest.SpyInstance

  beforeEach(() => {
    resSpy = createSpyObj('Response', ['status', 'json', 'end', 'send'])
    req = {
      db: { profiles: { getByName: jest.fn() } },
      query: { },
      params: { profileName: 'profileName' }
    }
    getByNameSpy = jest.spyOn(req.db.profiles, 'getByName').mockResolvedValue({})

    resSpy.status.mockReturnThis()
    resSpy.json.mockReturnThis()
    resSpy.send.mockReturnThis()
  })
  it('should get', async () => {
    await getProfile(req, resSpy)
    expect(getByNameSpy).toHaveBeenCalledWith('profileName')
    expect(resSpy.status).toHaveBeenCalledWith(200)
  })
  it('should handle error', async () => {
    jest.spyOn(req.db.profiles, 'getByName').mockRejectedValue(null)
    await getProfile(req, resSpy)
    expect(getByNameSpy).toHaveBeenCalledWith('profileName')
    expect(resSpy.status).toHaveBeenCalledWith(500)
  })
})
