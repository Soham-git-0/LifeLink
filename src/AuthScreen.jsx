
import React, { useEffect, useState } from 'react';
import { Droplets, HeartPulse, ArrowRight, Building2 } from 'lucide-react';

const API = 'http://localhost:5001/api';

export default function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    hospital_id: ''
  });

  useEffect(() => {
    if (mode !== 'register') return;

    fetch(`${API}/hospitals`)
      .then(response => {
        if (!response.ok) throw new Error('Could not load hospitals.');
        return response.json();
      })
      .then(data => setHospitals(data.hospitals || []))
      .catch(() => setError('Unable to load hospitals. Check that Flask is running.'));
  }, [mode]);

  const update = event => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const submit = async event => {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? 'login' : 'register';

      const payload = mode === 'login'
        ? { email: form.email, password: form.password }
        : {
            full_name: form.full_name,
            email: form.email,
            password: form.password,
            hospital_id: Number(form.hospital_id)
          };

      const response = await fetch(`${API}/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Request failed.');
      }

      if (mode === 'register') {
        setMessage('Account created. You can now log in.');
        setMode('login');
        setForm({
          full_name: '',
          email: form.email,
          password: '',
          hospital_id: ''
        });
      } else {
        onLogin(data.user);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">
            <Droplets size={28} />
            <HeartPulse size={24} />
          </div>
          <h1>LifeLink</h1>
          <p>Blood &amp; Organ Network</p>
        </div>

        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="auth-description">
          {mode === 'login'
            ? 'Sign in to access your hospital workspace.'
            : 'Register your staff account and select your hospital branch.'}
        </p>

        {error && <div className="auth-error" role="alert">{error}</div>}
        {message && <div className="auth-success" role="status">{message}</div>}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Full name
              <input
                name="full_name"
                value={form.full_name}
                onChange={update}
                placeholder="Enter your full name"
                autoComplete="name"
                required
              />
            </label>
          )}

          <label>
            Email address
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={update}
              placeholder="you@hospital.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={update}
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 8 : undefined}
              required
            />
          </label>

          {mode === 'register' && (
            <label>
              Hospital / Branch
              <select
                name="hospital_id"
                value={form.hospital_id}
                onChange={update}
                required
              >
                <option value="">Select your hospital branch</option>
                {hospitals.map(hospital => (
                  <option key={hospital.hospital_id} value={hospital.hospital_id}>
                    {hospital.hospital_name} — {hospital.branch_name} ({hospital.city}, {hospital.state})
                  </option>
                ))}
              </select>
            </label>
          )}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? 'Please wait...'
              : mode === 'login' ? 'Sign in' : 'Create account'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? "Don't have an account?" : 'Already registered?'}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
              setMessage('');
            }}
          >
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </div>

        <div className="auth-note">
          <Building2 size={16} />
          Hospital staff access · Secure session
        </div>
      </section>
    </main>
  );
}
