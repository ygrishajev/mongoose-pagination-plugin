const mongoose = require('mongoose')

const plugin = require('./index')

const get = jest.fn()
const schema = new mongoose.Schema({ name: String }, { timestamps: true })
plugin.paginationPlugin(schema, { paginationField: 'createdAt' })
const Model = mongoose.model('Model', schema)

const { Query } = mongoose
jest.spyOn(Model, 'where')
jest.spyOn(Query.prototype, 'limit')
jest.spyOn(Query.prototype, 'sort')
jest.spyOn(Query.prototype, 'exec').mockResolvedValue([])
jest.spyOn(schema, 'virtual').mockImplementation(() => ({ get }))

afterEach(() => jest.clearAllMocks())

describe('#paginationPlugin', () => {
  it('throws if no options.paginationField is provided', () => {
    expect(plugin.paginationPlugin).toThrowError(new Error('"options.paginationField" is required'))
  })

  it('configures a schema', () => {
    plugin.paginationPlugin(schema, { paginationField: 'createdAt' })

    expect(schema).toMatchObject({
      statics: {
        pageSize: 50,
        paginationField: 'createdAt',
        paginate: expect.any(Function)
      },
      query: {
        paginate: expect.any(Function)
      }
    })
    expect(schema.virtual).toHaveBeenCalledWith('cursor')
    expect(get).toHaveBeenCalledWith(expect.any(Function))
  })

  it('configures a schema with custom limit', () => {
    plugin.paginationPlugin(schema, { paginationField: 'createdAt', defaultLimit: 25 })

    expect(schema).toMatchObject(expect.objectContaining({
      statics: expect.objectContaining({ pageSize: 25 })
    }))

    plugin.paginationPlugin(schema, { paginationField: 'createdAt' })
  })
})

describe('#paginate', () => {
  it('paginates after a cursor', () => {
    Model.paginate({ after: 'NWYyOTc3MmVlM2NmZDIwNDA3YzBkNmRlXzE1OTY1NTMwMDY5NDE' })

    expect(Model.where).toHaveBeenCalledWith({
      $and: [{
        $or: [
          { createdAt: { $gt: '1596553006941' } },
          {
            createdAt: { $eq: '1596553006941' },
            _id: { $gt: '5f29772ee3cfd20407c0d6de' }
          }
        ]
      }]
    })
  })

  it('paginates after a cursor', () => {
    Model.paginate({ before: 'NWYyOTc3MmVlM2NmZDIwNDA3YzBkNmRlXzE1OTY1NTMwMDY5NDE' })

    expect(Model.where).toHaveBeenCalledWith({
      $and: [{
        $or: [
          { createdAt: { $lt: '1596553006941' } },
          {
            createdAt: { $eq: '1596553006941' },
            _id: { $lt: '5f29772ee3cfd20407c0d6de' }
          }
        ]
      }]
    })
  })

  it('paginates before and after provided cursors', () => {
    Model.paginate({
      before: 'NWYyOTc3MmVlM2NmZDIwNDA3YzBkNmRlXzE1OTY1NTMwMDY5NDE',
      after: 'NWYyOTU2MmI1ZGQwYzQwMDMzMjBjMTMyXzE1OTY1NDQ1NTUxMzg='
    })

    expect(Model.where).toHaveBeenCalledWith({
      $and: [{
        $or: [
          { createdAt: { $gt: '1596544555138', $lt: '1596553006941' } },
          {
            createdAt: { $eq: '1596544555138' },
            _id: { $gt: '5f29562b5dd0c4003320c132' }
          },
          {
            createdAt: { $eq: '1596553006941' },
            _id: { $lt: '5f29772ee3cfd20407c0d6de' }
          }
        ]
      }]
    })
  })

  it('paginates with default limit', () => {
    Model.paginate()

    expect(Query.prototype.limit).toHaveBeenCalledWith(51)
  })

  it('paginates with provided limit derived from first prop and default order', () => {
    Model.paginate({ first: 25 })

    expect(Query.prototype.limit).toHaveBeenCalledWith(26)
    expect(Query.prototype.sort).toHaveBeenCalledWith('createdAt _id')
  })

  it('paginates with provided limit derived from last prop and inverted default order', () => {
    Model.paginate({ last: 25 })

    expect(Query.prototype.limit).toHaveBeenCalledWith(26)
    expect(Query.prototype.sort).toHaveBeenCalledWith('-createdAt -_id')
  })

  it('does not return meta', () => {
    Model.paginate({ last: 25 })

    expect(Query.prototype.limit).toHaveBeenCalledWith(26)
    expect(Query.prototype.sort).toHaveBeenCalledWith('-createdAt -_id')
  })

  it('queries for docs with page meta', async () => {
    await Model.paginate({
      before: 'NWYyOTc3MmVlM2NmZDIwNDA3YzBkNmRlXzE1OTY1NTMwMDY5NDE',
      after: 'NWYyOTU2MmI1ZGQwYzQwMDMzMjBjMTMyXzE1OTY1NDQ1NTUxMzg='
    })

    expect(Query.prototype.exec).toHaveBeenCalledTimes(3)
  })

  it('queries for docs without page meta', async () => {
    await Model.paginate({
      before: 'NWYyOTc3MmVlM2NmZDIwNDA3YzBkNmRlXzE1OTY1NTMwMDY5NDE',
      withMeta: false
    })

    expect(Query.prototype.exec).toHaveBeenCalledTimes(1)
  })

  it('queries for docs without page meta', async () => {
    await Model.paginate({
      before: 'NWYyOTc3MmVlM2NmZDIwNDA3YzBkNmRlXzE1OTY1NTMwMDY5NDE',
      withMeta: false
    })

    expect(Query.prototype.exec).toHaveBeenCalledTimes(1)
  })

  it('prepares meta', async () => {
    const spy = jest.spyOn(plugin.prepareMetaCursors, 'bind')
    const before = 'NWYyOTc3MmVlM2NmZDIwNDA3YzBkNmRlXzE1OTY1NTMwMDY5NDE'
    await Model.paginate({ before })

    expect(spy).toHaveBeenCalledWith(expect.any(Query), expect.any(Object), {
      before,
      sort: 'createdAt'
    })
  })

  it('calls an afterware', async () => {
    const afterware = jest.fn()
    const toAfterware = jest.spyOn(plugin, 'toAfterware').mockReturnValueOnce(afterware)
    await Model.paginate({})

    expect(toAfterware).toHaveBeenCalledWith(undefined, 51)
    expect(afterware).toHaveBeenCalledWith([[], undefined, undefined])
  })
})

describe('#createCursor', () => {
  it('creates a cursor', () => {
    const doc = new Model({
      _id: '5f29772ee3cfd20407c0d6de',
      createdAt: '1596553006941'
    })

    expect(doc.cursor).toBe('NWYyOTc3MmVlM2NmZDIwNDA3YzBkNmRlXzE1OTY1NTMwMDY5NDE=')
  })
})

describe('#toAfterware', () => {
  it('reverses result if last is provided', () => {
    expect(plugin.toAfterware(2)([[1, 2]])).toMatchObject(expect.objectContaining({
      data: [2, 1]
    }))
  })

  it('returns raw result if last is not provided', () => {
    expect(plugin.toAfterware(undefined)([[1, 2]])).toMatchObject(expect.objectContaining({
      data: [1, 2]
    }))
  })

  it('adds start and end cursors', () => {
    const start = 'start'
    const end = 'end'
    expect(plugin.toAfterware(undefined)([[{ cursor: start }, { cursor: end }]]))
      .toMatchObject(expect.objectContaining({
        startCursor: start,
        endCursor: end
      }))
  })

  it('resolves prev and next page existence from relative cursors check', () => {
    expect(plugin.toAfterware(undefined)([[], { data: [{}] }, { data: [] }]))
      .toMatchObject(expect.objectContaining({
        hasPreviousPage: true,
        hasNextPage: false
      }))
  })

  it('resolves prev and next page existence from limit with last option', () => {
    expect(plugin.toAfterware(2, 2)([[{}, {}]]))
      .toMatchObject(expect.objectContaining({
        hasPreviousPage: true,
        hasNextPage: false
      }))
  })

  it('resolves prev and next page existence from limit without last option', () => {
    expect(plugin.toAfterware(undefined, 2)([[{}, {}]]))
      .toMatchObject(expect.objectContaining({
        hasPreviousPage: false,
        hasNextPage: true
      }))
  })
})
