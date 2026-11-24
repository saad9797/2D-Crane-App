declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      user?: { id: string; email: string };
    }
  }
}
export {};
