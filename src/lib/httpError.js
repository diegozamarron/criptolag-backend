// An error that is safe to show the client, with the status to send
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// HttpErrors keep their status and message; anything else is logged and hidden
// behind a generic 500 so internal details never reach the client.
export const sendError = (res, err, context, fallback = 'Something went wrong. Please try again.') => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`Error in ${context}:`, err);
  res.status(500).json({ error: fallback });
};
