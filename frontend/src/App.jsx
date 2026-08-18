import { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health/`);
        if (!response.ok) {
          throw new Error(`API responded with status ${response.status}`);
        }
        const data = await response.json();
        setHealth(data);
      } catch (fetchError) {
        setError(fetchError.message);
      } finally {
        setLoading(false);
      }
    }

    fetchHealth();
  }, []);

  return (
    <main className="app">
      <h1>Attendance SaaS</h1>
      <p className="subtitle">Technical foundation — local development stack</p>

      <section className="panel">
        <h2>Backend health check</h2>
        {loading && <p>Checking API connection…</p>}
        {error && <p className="error">Could not reach backend: {error}</p>}
        {health && (
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{health.status}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{health.service}</dd>
            </div>
            <div>
              <dt>Database</dt>
              <dd>{health.database}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}

export default App;
