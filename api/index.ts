// Vercel serverless entry point
// This re-exports the Express app configured for Vercel
import app from '../server/vercel';

export default app;
