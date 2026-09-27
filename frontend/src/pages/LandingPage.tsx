import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div className="landing">
      <div className="landing-hero">
        <img src="/favicon.svg" alt="HollowLink logo" width={84} height={84} />
        <h1>HollowLink</h1>
        <p className="landing-tagline">
          Your people. Your space. Your link. A private digital headquarters for your circle — chat, share,
          plan, and stay close.
        </p>
        <div className="landing-actions">
          <Link to="/register" className="btn btn-primary" style={{ padding: '12px 28px', fontSize: 15 }}>
            Create your space
          </Link>
          <Link to="/login" className="btn" style={{ padding: '12px 28px', fontSize: 15 }}>
            Sign in
          </Link>
        </div>
      </div>
      <footer className="landing-footer">
        A private social space by <strong>Hollow Technologies</strong> · No feeds for strangers. No tracking. Just your people.
      </footer>
    </div>
  );
}
