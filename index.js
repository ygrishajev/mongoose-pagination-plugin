const { Query } = require('mongoose')
const merge = require('lodash/merge')
const get = require('lodash/get')
const cloneDeep = require('lodash/cloneDeep')
const pickFirst = require('lodash/first')
const pickLast = require('lodash/last')

const exp = {
  default: paginationPlugin,
  paginationPlugin,
  paginate,
  toPaginator,
  decodeCursor,
  invertOrder,
  prepareMetaCursors,
  toAfterware,
  addCursorVirtual,
  createCursor
}

function paginationPlugin(schema, options = {}) {
  if (!options.paginationField) {
    throw new Error('"options.paginationField" is required')
  }

  /* eslint-disable no-param-reassign */
  schema.statics.pageSize = options.defaultLimit || 50
  schema.statics.paginationField = options.paginationField
  schema.query.paginate = exp.paginate
  schema.statics.paginate = exp.paginate

  addCursorVirtual(schema)

  return schema
}

function paginate(options = {}) {
  const field = this.schema.statics.paginationField
  const {
    after,
    before,
    last,
    first = this.schema.statics.pageSize,
    sort = field,
    withMeta = true
  } = options
  const toParams = exp.toPaginator({ field, ...options })
  const afterPagination = toParams('after', after)
  const beforePagination = toParams('before', before)
  let pagination = {}

  if (!before || !after) {
    merge(pagination, afterPagination, beforePagination)
  }

  if (before && after) {
    pagination = {
      $or: [
        merge({}, afterPagination.$or[0], beforePagination.$or[0]),
        afterPagination.$or[1],
        beforePagination.$or[1]
      ]
    }
  }

  let order = `${sort} ${sort.startsWith('-') ? '-' : ''}_id`
  order = last ? exp.invertOrder(order) : order
  const limit = Number(last || first) + 1

  const conditions = (this instanceof Query) ? this.getFilter() : {}
  const $and = conditions.$and ? [pagination, ...conditions.$and] : [pagination]

  const cursor = this
    .where({ $and })
    .sort(order)
    .limit(limit)

  const prepareMeta = withMeta
    ? exp.prepareMetaCursors.bind(cursor, pagination, { sort, ...options })
    : () => []

  cursor.then = function then(resolve, reject) {
    return Promise.all([this.exec(), ...prepareMeta()])
      .then(exp.toAfterware(last, limit))
      .then(resolve, reject)
  }

  return cursor
}

function toPaginator({
  last,
  field,
  sort,
  inclusive = false
}) {
  return (type, cursor) => {
    if (!cursor) {
      return {}
    }

    const isAfter = type === 'after'
    const primary = isAfter ? '$lt' : '$gt'
    const secondary = isAfter ? '$gt' : '$lt'
    const { _id, [field]: value } = exp.decodeCursor(cursor, field)
    let op = sort === `-${field}` && !last ? primary : secondary

    if (inclusive) {
      op += 'e'
    }

    return {
      $or: [
        { [field]: { [op]: value } },
        {
          [field]: { $eq: value },
          _id: {
            [op]: _id
          }
        }
      ]
    }
  }
}

function decodeCursor(cursor, field) {
  const [_id, value] = Buffer.from(cursor, 'base64').toString('utf-8').split('_')

  return {
    _id,
    [field]: value
  }
}

function invertOrder(order = '') {
  return order
    .split(' ')
    .map(item => (item.startsWith('-') ? item.slice(1) : `-${item}`))
    .join(' ')
}

function prepareMetaCursors(pagination, options) {
  const {
    after,
    before,
    sort
  } = options

  let conditions = this.getFilter()
  const paginationPos = conditions.$and.findIndex(condition => condition === pagination)
  conditions = cloneDeep(conditions)

  if (paginationPos > -1) {
    conditions.$and.splice(paginationPos, 1)
  }

  if (!conditions.$and.length) {
    delete conditions.$and
  }

  const common = { sort, withMeta: false, inclusive: true }
  const prevCursor = after && this.model
    .where(conditions)
    .paginate({ before: after, last: 1, ...common })
  const nextCursor = before && this.model
    .where(conditions)
    .paginate({ after: before, first: 1, ...common })

  return [prevCursor, nextCursor]
}

function toAfterware(last, limit) {
  return ([docs, prev, next]) => {
    const data = docs.length === limit ? docs.slice(0, -1) : docs

    return {
      data: last ? data.reverse() : data,
      startCursor: get(pickFirst(data), 'cursor'),
      endCursor: get(pickLast(data), 'cursor'),
      hasPreviousPage: !!(get(prev, 'data.length') || (last && limit === docs.length)),
      hasNextPage: !!(get(next, 'data.length') || (!last && limit === docs.length))
    }
  }
}

function addCursorVirtual(schema) {
  schema
    .virtual('cursor')
    .get(exp.createCursor)
}

function createCursor() {
  const field = this.schema.statics.paginationField
  const isDate = get(this, `schema.paths[${field}].instance`) === 'Date'
  const value = isDate ? new Date(this[field]).getTime() : this[field]

  return Buffer
    // eslint-disable-next-line no-underscore-dangle
    .from(`${this._id}_${value}`)
    .toString('base64')
}

module.exports = exp
