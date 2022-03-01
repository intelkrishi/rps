import { createSpyObj } from '../../../test/helper/jest'
import { editDomain } from './edit'

describe('CIRA Config - Edit', () => {
  let resSpy
  let req
  let getByNameSpy: jest.SpyInstance

  beforeEach(() => {
    resSpy = createSpyObj('Response', ['status', 'json', 'end', 'send'])
    req = {
      db: { domains: { getByName: jest.fn(), update: jest.fn() } },
      body: { profileName: 'profileName' },
      query: { }
    }
    getByNameSpy = jest.spyOn(req.db.domains, 'getByName').mockResolvedValue({})
    jest.spyOn(req.db.domains, 'update').mockResolvedValue({})

    resSpy.status.mockReturnThis()
    resSpy.json.mockReturnThis()
    resSpy.send.mockReturnThis()
  })
  it('should edit', async () => {
    await editDomain(req, resSpy)
    expect(getByNameSpy).toHaveBeenCalledWith('profileName')
    expect(resSpy.status).toHaveBeenCalledWith(200)
  })
  it('should handle not found', async () => {
    jest.spyOn(req.db.domains, 'getByName').mockResolvedValue(null)
    await editDomain(req, resSpy)
    expect(getByNameSpy).toHaveBeenCalledWith('profileName')
    expect(resSpy.status).toHaveBeenCalledWith(404)
  })
  it('should handle error', async () => {
    jest.spyOn(req.db.domains, 'getByName').mockRejectedValue(null)
    await editDomain(req, resSpy)
    expect(getByNameSpy).toHaveBeenCalledWith('profileName')
    expect(resSpy.status).toHaveBeenCalledWith(500)
  })
})
