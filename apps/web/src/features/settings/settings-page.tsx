'use client';

import { NoAccess } from '@/components/states';
import { PageHeader } from '@/components/ui';
import { OperatorDefaults } from './operator-defaults';
import { PairRobot } from './pair-robot';
import { useSettingsPermissions } from './queries';
import { RoleMatrix } from './role-matrix';
import styles from './settings.module.css';
import { UsersSection } from './users';

// Each block shows only with its permission. A client user never gets here: the shell shows NoAccess first.
export function SettingsPage() {
  const { canPair, canReadUsers, canReadRoles, canEditDefaults } = useSettingsPermissions();
  const any = canPair || canReadUsers || canReadRoles || canEditDefaults;

  return (
    <>
      <PageHeader title="Configurações" subtitle="Pareamento de robôs, usuários e papéis." />
      {any ? (
        <div className={styles.sections}>
          {canPair && <PairRobot />}
          {canReadUsers && <UsersSection />}
          {canReadRoles && <RoleMatrix />}
          {canEditDefaults && <OperatorDefaults />}
        </div>
      ) : (
        <NoAccess />
      )}
    </>
  );
}
