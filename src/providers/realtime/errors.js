class ProviderUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProviderUnavailableError';
    this.statusCode = 501;
    this.publicMessage = message;
  }
}

class ProviderRequestError extends Error {
  constructor(message, statusCode = 502, details = null) {
    super(message);
    this.name = 'ProviderRequestError';
    this.statusCode = statusCode;
    this.publicMessage = message;
    this.details = details;
  }
}

module.exports = {
  ProviderUnavailableError,
  ProviderRequestError,
};
