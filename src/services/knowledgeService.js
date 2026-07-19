const { decryptText, encryptText, stableContentHash } = require('./cryptoService');
const { extractOutputText } = require('./webResearchService');

const MAX_TEXT_CHARS = 20_000;
const MAX_IMAGE_DATA_URL_CHARS = 5_500_000;

function cleanAssetName(value) {
  return String(value || 'Untitled upload').trim().replace(/\s+/g, ' ').slice(0, 140);
}

function cleanKind(value) {
  return ['document', 'photo', 'note'].includes(value) ? value : 'document';
}

function summarizeTextContent(value) {
  const clean = String(value || '').trim().replace(/\u0000/g, '');
  return clean.length > MAX_TEXT_CHARS ? `${clean.slice(0, MAX_TEXT_CHARS)}\n\n[Content clipped for prompt safety.]` : clean;
}

function decryptKnowledgeAsset(asset) {
  const content = decryptText(asset);
  return {
    id: asset.id,
    userId: asset.userId,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType,
    content,
    metadata: asset.metadata || {},
    createdAt: asset.createdAt,
  };
}

async function describeImageDataUrl({ name, imageDataUrl, fetchImpl = global.fetch } = {}) {
  if (!process.env.OPENAI_API_KEY) {
    return `Uploaded photo: ${name}. Image description is unavailable until OPENAI_API_KEY is configured.`;
  }

  if (!imageDataUrl || imageDataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
    return `Uploaded photo: ${name}. The image was too large to describe automatically.`;
  }

  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.KNOWLEDGE_IMAGE_MODEL || 'gpt-5.4-mini',
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Describe this uploaded image for Mira's private knowledge base. Focus on durable facts, visible text, people/objects, and anything the user may later ask about. File name: ${name}`,
          },
          {
            type: 'input_image',
            image_url: imageDataUrl,
          },
        ],
      }],
    }),
  });

  const responseJson = await response.json().catch(() => null);
  if (!response.ok) {
    return `Uploaded photo: ${name}. Automatic image description failed.`;
  }

  return extractOutputText(responseJson) || `Uploaded photo: ${name}.`;
}

async function createKnowledgeAsset(models, {
  userId,
  name,
  kind = 'document',
  mimeType = 'text/plain',
  textContent = '',
  imageDataUrl = '',
  imageDescriber = describeImageDataUrl,
} = {}) {
  if (!userId) {
    const err = new Error('userId is required.');
    err.statusCode = 400;
    throw err;
  }

  const assetName = cleanAssetName(name);
  const assetKind = cleanKind(kind);
  const sourceContent = assetKind === 'photo' && !textContent
    ? await imageDescriber({ name: assetName, imageDataUrl })
    : textContent;
  const content = summarizeTextContent(sourceContent);

  if (!content) {
    const err = new Error('textContent or imageDataUrl is required.');
    err.statusCode = 400;
    err.publicMessage = 'Upload content is required.';
    throw err;
  }

  const encrypted = encryptText(content);
  const asset = await models.KnowledgeAsset.create({
    userId,
    name: assetName,
    kind: assetKind,
    mimeType: String(mimeType || 'application/octet-stream').slice(0, 120),
    ...encrypted,
    contentHash: stableContentHash(`${userId}:${assetName}:${content}`),
    metadata: {
      source: 'user_upload',
      characterCount: content.length,
      clipped: String(sourceContent || '').length > MAX_TEXT_CHARS,
    },
  });

  return decryptKnowledgeAsset(asset);
}

async function listKnowledgeAssets(models, userId, limit = 20) {
  const assets = await models.KnowledgeAsset.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
  });

  return assets.map(decryptKnowledgeAsset);
}

async function getRelevantKnowledgeAssets(models, userId, limit = 6) {
  if (!models.KnowledgeAsset) return [];
  return listKnowledgeAssets(models, userId, limit);
}

async function deleteKnowledgeAsset(models, { userId, assetId }) {
  const asset = await models.KnowledgeAsset.findOne({ where: { id: assetId, userId } });
  if (!asset) return false;
  await asset.destroy();
  return true;
}

module.exports = {
  createKnowledgeAsset,
  deleteKnowledgeAsset,
  describeImageDataUrl,
  getRelevantKnowledgeAssets,
  listKnowledgeAssets,
};
