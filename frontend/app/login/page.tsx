'use client';

import { Button, InlineNotification, RadioButton, RadioButtonGroup, Stack, TextInput, Tile } from '@carbon/react';
import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import type { AuthRole } from '@/types/api';
import styles from './login.module.css';

export default function LoginPage() {
  return (
    <Suspense fallback={<div />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, sessions, login, signUp, loading, error, clearError } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<AuthRole>('OPERATOR');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const addingAccount = searchParams.get('addAccount') === '1';

  const resetErrors = useCallback(() => {
    setLocalError(null);
    clearError();
  }, [clearError]);

  useEffect(() => {
    resetErrors();
  }, [username, password, confirmPassword, role, resetErrors]);

  const routeByRole = useCallback(
    (roles: string[]) => (roles.includes('SUPERVISOR') ? '/supervisor' : '/operator'),
    [],
  );

  useEffect(() => {
    if (!user) {
      return;
    }
    if (addingAccount) {
      return;
    }
    router.replace(routeByRole(user.roles));
  }, [user, addingAccount, router, routeByRole]);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const profile = await login(username.trim(), password);
      router.replace(routeByRole(profile.roles));
    } catch (err) {
      console.error('Login failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const profile = await signUp({ username, password, role });
      router.replace(routeByRole(profile.roles));
    } catch (err) {
      console.error('Sign-up failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || loading;
  const displayError = localError ?? error;

  const heading = mode === 'signin' ? 'Sign in' : 'Create your account';
  const subheading =
    mode === 'signin'
      ? 'Use your operator or supervisor account to continue.'
      : 'Sign up to create an operator or supervisor profile.';

  const primaryActionLabel = mode === 'signin' ? 'Sign in' : 'Create account';

  const toggleMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setSubmitting(false);
    if (next === 'signin') {
      setConfirmPassword('');
    }
    resetErrors();
  };

  const formSubmit = mode === 'signin' ? handleSignIn : handleSignUp;

  return (
    <div className={styles.container}>
      <Tile className={styles.card}>
        <Stack gap={6}>
          <div className={styles.header}>
            <p className={styles.kicker}>ProduSoft workflow</p>
            <h2 className="cds--heading-05">{heading}</h2>
            <p className={styles.subtitle}>{subheading}</p>
            {sessions.length > 1 && !addingAccount && mode === 'signin' && (
              <p className={styles.subtitle}>
                You have {sessions.length} accounts available. Use the profile menu to switch between them.
              </p>
            )}
          </div>

          {displayError && (
            <InlineNotification
              kind="error"
              lowContrast
              title={mode === 'signin' ? 'Sign-in failed' : 'Sign-up failed'}
              subtitle={displayError}
              onClose={resetErrors}
            />
          )}

          <form className={styles.form} onSubmit={formSubmit}>
            <Stack gap={4}>
              <TextInput
                id="username"
                name="username"
                labelText="Username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="operator1"
                required
              />
              <TextInput
                id="password"
                name="password"
                labelText="Password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                required
              />
              {mode === 'signup' && (
                <>
                  <TextInput
                    id="confirmPassword"
                    name="confirmPassword"
                    labelText="Confirm password"
                    autoComplete="new-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="********"
                    required
                  />
                  <div className={styles.roleChooser}>
                    <RadioButtonGroup
                      legendText="Choose your role"
                      name="role"
                      orientation="vertical"
                      value={role}
                      onChange={(value) => setRole((value as AuthRole) ?? 'OPERATOR')}
                    >
                      <RadioButton
                        id="role-operator"
                        value="OPERATOR"
                        labelText="Operator - run and complete workflow stages"
                      />
                      <RadioButton
                        id="role-supervisor"
                        value="SUPERVISOR"
                        labelText="Supervisor - approve, unblock, and monitor work in flight"
                      />
                    </RadioButtonGroup>
                  </div>
                </>
              )}
              <Button type="submit" kind="primary" size="lg" disabled={busy}>
                {busy ? (mode === 'signin' ? 'Signing in...' : 'Creating account...') : primaryActionLabel}
              </Button>
            </Stack>
          </form>

          <div className={styles.modeToggle}>
            <p className={styles.toggleText}>{mode === 'signin' ? 'No account yet?' : 'Already registered?'}</p>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => toggleMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              {mode === 'signin' ? 'Create one' : 'Go back to sign in'}
            </button>
          </div>

          {mode === 'signin' && (
            <div className={styles.hint}>
              <p>Sample accounts:</p>
              <ul>
                <li>
                  Operator - <code>operator1 / user</code>
                </li>
                <li>
                  Supervisor - <code>supervisor1 / superuser</code>
                </li>
              </ul>
            </div>
          )}
        </Stack>
      </Tile>
    </div>
  );
}
