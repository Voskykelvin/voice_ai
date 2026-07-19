const { DataTypes } = require('sequelize');

function initModels(sequelize) {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    displayName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    timezone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  }, {
    tableName: 'users',
    timestamps: true,
  });

  const VoiceSession = sequelize.define('VoiceSession', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    providerSessionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'active',
    },
    model: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    voice: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  }, {
    tableName: 'voice_sessions',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['status'] },
    ],
  });

  const ConversationTurn = sequelize.define('ConversationTurn', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sessionId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    providerEventId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [['user', 'assistant', 'system']],
      },
    },
    encryptedContent: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    contentIv: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    contentTag: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    contentHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isCrisis: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  }, {
    tableName: 'conversation_turns',
    timestamps: true,
    indexes: [
      { fields: ['userId', 'sessionId'] },
      { fields: ['contentHash'] },
      { fields: ['createdAt'] },
    ],
  });

  const Memory = sequelize.define('Memory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    encryptedContent: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    contentIv: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    contentTag: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    contentHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'fact',
    },
    importance: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
      validate: {
        min: 1,
        max: 5,
      },
    },
    isSensitive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sourceSessionId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    lastReferencedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  }, {
    tableName: 'memories',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['userId', 'category'] },
      { fields: ['contentHash'] },
    ],
  });

  const MemoryEvent = sequelize.define('MemoryEvent', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    memoryId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  }, {
    tableName: 'memory_events',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['memoryId'] },
    ],
  });

  const UsageEvent = sequelize.define('UsageEvent', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sessionId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    model: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    eventType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    inputTokens: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    outputTokens: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    audioInputSeconds: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    audioOutputSeconds: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    estimatedCostUsd: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  }, {
    tableName: 'usage_events',
    timestamps: true,
    indexes: [
      { fields: ['userId', 'sessionId'] },
      { fields: ['eventType'] },
    ],
  });

  const KnowledgeAsset = sequelize.define('KnowledgeAsset', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'document',
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'text/plain',
    },
    encryptedContent: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    contentIv: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    contentTag: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    contentHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
  }, {
    tableName: 'knowledge_assets',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['userId', 'kind'] },
      { fields: ['contentHash'] },
    ],
  });

  User.hasMany(VoiceSession, { foreignKey: 'userId' });
  VoiceSession.belongsTo(User, { foreignKey: 'userId' });
  User.hasMany(ConversationTurn, { foreignKey: 'userId' });
  User.hasMany(Memory, { foreignKey: 'userId' });
  User.hasMany(KnowledgeAsset, { foreignKey: 'userId' });

  return {
    sequelize,
    User,
    VoiceSession,
    ConversationTurn,
    Memory,
    MemoryEvent,
    UsageEvent,
    KnowledgeAsset,
  };
}

module.exports = { initModels };
