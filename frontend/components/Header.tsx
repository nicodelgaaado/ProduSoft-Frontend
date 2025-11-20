'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Header as CarbonHeader,
  HeaderGlobalBar,
  HeaderName,
  SkipToContent,
  Theme,
} from '@carbon/react';
import { Add, ChevronDown, Logout, UserAvatar } from '@carbon/icons-react';
import { useAuth } from '@/hooks/useAuth';
import styles from './Header.module.css';

export function Header() {
  const router = useRouter();
  const { user, sessions, switchAccount, logout, logoutAll } = useAuth();
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const defaultDestinationFor = (roles: string[]) =>
    roles.includes('SUPERVISOR') ? '/supervisor' : '/operator';

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [menuOpen]);

  const handleSwitchAccount = (username: string, roles: string[]) => {
    const next = switchAccount(username);
    setMenuOpen(false);
    const destination = defaultDestinationFor(next?.roles ?? roles);
    router.replace(destination);
  };

  const handleLogoutAccount = (username: string) => {
    const next = logout(username);
    setMenuOpen(false);
    if (!next) {
      router.replace('/login');
      return;
    }
    const destination = defaultDestinationFor(next.roles);
    router.replace(destination);
  };

  const handleLogoutAll = () => {
    logoutAll();
    setMenuOpen(false);
    router.replace('/login');
  };

  const handleAddAccount = () => {
    setMenuOpen(false);
    router.push('/login?addAccount=1');
  };

  return (
    <Theme theme="g100">
      <CarbonHeader aria-label="ProduSoft console">
        <SkipToContent />
        <HeaderName href="/" prefix="ProduSoft">
          Workflow
        </HeaderName>
        <HeaderGlobalBar>
          {user && (
            <div className={styles.accountSwitcher}>
              <button
                ref={buttonRef}
                type="button"
                className={styles.accountButton}
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="true"
                aria-expanded={menuOpen}
              >
                <UserAvatar size={20} />
                <span className={styles.accountName}>{user.username}</span>
                <ChevronDown size={16} aria-hidden />
              </button>
              {menuOpen && (
                <div ref={menuRef} className={styles.accountMenu} role="menu">
                  <div className={styles.menuHeader}>
                    <span className={styles.menuTitle}>Signed in</span>
                  </div>
                  <ul className={styles.accountList}>
                    {sessions.map((account) => (
                      <li
                        key={account.username}
                        className={account.isActive ? styles.activeAccount : undefined}
                      >
                        <button
                          type="button"
                          className={styles.accountEntry}
                          onClick={() => handleSwitchAccount(account.username, account.roles)}
                          disabled={account.isActive}
                        >
                          <span className={styles.entryName}>{account.username}</span>
                          <span className={styles.entryRoles}>{account.roles.join(', ')}</span>
                          {account.isActive && <span className={styles.activeBadge}>Active</span>}
                        </button>
                        <button
                          type="button"
                          className={styles.signOutEntry}
                          onClick={() => handleLogoutAccount(account.username)}
                        >
                          <Logout size={16} />
                          Sign out
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.menuActions}>
                    <button type="button" className={styles.menuAction} onClick={handleAddAccount}>
                      <Add size={16} />
                      Add another account
                    </button>
                    <button type="button" className={styles.menuAction} onClick={handleLogoutAll}>
                      <Logout size={16} />
                      Sign out of all accounts
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </HeaderGlobalBar>
      </CarbonHeader>
    </Theme>
  );
}
