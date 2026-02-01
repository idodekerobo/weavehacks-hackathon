import { Router, Request, Response } from 'express';
import { 
  getAuthorizationUrl, 
  exchangeCodeForTokens, 
  getConnectionStatus,
  disconnectCalendar
} from '../services/google-calendar';

const router = Router();

/**
 * Start OAuth flow - redirects to Google authorization page
 */
router.get('/google/authorize', (req: Request, res: Response) => {
  try {
    const authUrl = getAuthorizationUrl();
    
    console.log('🔐 Starting Google OAuth flow...');
    
    // Redirect to Google's OAuth consent screen
    res.redirect(authUrl);
  } catch (error: any) {
    console.error('❌ Failed to generate authorization URL:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to start authorization flow'
    });
  }
});

/**
 * OAuth callback - Google redirects here after user authorizes
 */
router.get('/google/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query;

  // Handle authorization errors
  if (error) {
    console.error('❌ OAuth authorization failed:', error);
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authorization Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; text-align: center; }
            .error { color: #dc3545; }
            .container { max-width: 600px; margin: 0 auto; }
            button { background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; }
            button:hover { background: #0056b3; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="error">❌ Authorization Failed</h1>
            <p>Failed to authorize Google Calendar access: ${error}</p>
            <button onclick="window.close()">Close Window</button>
          </div>
        </body>
      </html>
    `);
  }

  // Verify authorization code
  if (!code || typeof code !== 'string') {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authorization Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; text-align: center; }
            .error { color: #dc3545; }
            .container { max-width: 600px; margin: 0 auto; }
            button { background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; }
            button:hover { background: #0056b3; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="error">❌ Invalid Authorization</h1>
            <p>No authorization code received from Google.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
        </body>
      </html>
    `);
  }

  try {
    // Exchange authorization code for access/refresh tokens
    await exchangeCodeForTokens(code);

    console.log('✅ Google Calendar authorization successful');

    // Show success page
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authorization Successful</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; text-align: center; }
            .success { color: #28a745; }
            .container { max-width: 600px; margin: 0 auto; }
            button { background: #28a745; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; margin-top: 20px; }
            button:hover { background: #218838; }
            .icon { font-size: 64px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">✅</div>
            <h1 class="success">Google Calendar Connected!</h1>
            <p>Your Google Calendar has been successfully connected to the Photos-as-Intent Agent.</p>
            <p>Calendar events will now be automatically created when you approve event flyers.</p>
            <button onclick="window.close()">Close Window</button>
          </div>
          <script>
            // Auto-close after 3 seconds
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);

  } catch (error: any) {
    console.error('❌ Failed to exchange authorization code:', error.message);
    
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authorization Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; text-align: center; }
            .error { color: #dc3545; }
            .container { max-width: 600px; margin: 0 auto; }
            button { background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; }
            button:hover { background: #0056b3; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="error">❌ Authorization Failed</h1>
            <p>Failed to save authorization tokens: ${error.message}</p>
            <button onclick="window.close()">Close Window</button>
          </div>
        </body>
      </html>
    `);
  }
});

/**
 * Check OAuth connection status
 */
router.get('/google/status', (req: Request, res: Response) => {
  try {
    const status = getConnectionStatus();
    
    res.json({
      success: true,
      ...status
    });
  } catch (error: any) {
    console.error('❌ Failed to get connection status:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Disconnect Google Calendar
 */
router.post('/google/disconnect', (req: Request, res: Response) => {
  try {
    disconnectCalendar();
    
    res.json({
      success: true,
      message: 'Google Calendar disconnected successfully'
    });
  } catch (error: any) {
    console.error('❌ Failed to disconnect:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
