const { randomUUID } = require('crypto');

function matchesWhere(row, where = {}) {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function makeModel(name, store) {
  return {
    async create(values) {
      const row = {
        id: values.id || randomUUID(),
        ...values,
        createdAt: values.createdAt || new Date(),
        updatedAt: values.updatedAt || new Date(),
        async update(nextValues) {
          Object.assign(row, nextValues, { updatedAt: new Date() });
          return row;
        },
        async destroy() {
          row.deletedAt = new Date();
          return row;
        },
      };
      store[name].push(row);
      return row;
    },
    async findAll({ where = {}, order = [], limit } = {}) {
      let rows = store[name].filter((row) => !row.deletedAt && matchesWhere(row, where));
      for (const [field, direction] of [...order].reverse()) {
        rows = rows.sort((a, b) => {
          const av = a[field] instanceof Date ? a[field].getTime() : a[field];
          const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
          if (av === bv) return 0;
          return direction === 'DESC' ? (av > bv ? -1 : 1) : (av > bv ? 1 : -1);
        });
      }
      return typeof limit === 'number' ? rows.slice(0, limit) : rows;
    },
    async findOne({ where = {} } = {}) {
      return store[name].find((row) => !row.deletedAt && matchesWhere(row, where)) || null;
    },
    async findOrCreate({ where = {}, defaults = {} } = {}) {
      const existing = await this.findOne({ where });
      if (existing) return [existing, false];
      const created = await this.create({ ...defaults, ...where });
      return [created, true];
    },
  };
}

function createFakeModels() {
  const store = {
    User: [],
    VoiceSession: [],
    ConversationTurn: [],
    Memory: [],
    MemoryEvent: [],
    UsageEvent: [],
    KnowledgeAsset: [],
  };

  return {
    store,
    User: makeModel('User', store),
    VoiceSession: makeModel('VoiceSession', store),
    ConversationTurn: makeModel('ConversationTurn', store),
    Memory: makeModel('Memory', store),
    MemoryEvent: makeModel('MemoryEvent', store),
    UsageEvent: makeModel('UsageEvent', store),
    KnowledgeAsset: makeModel('KnowledgeAsset', store),
  };
}

module.exports = { createFakeModels };
