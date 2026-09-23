/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link } from '@tanstack/react-router'
import { useEffect, useId, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TermsFooter } from '@/features/auth/components/terms-footer'
import { UserAuthForm } from '@/features/auth/sign-in/components/user-auth-form'
import { SignUpForm } from '@/features/auth/sign-up/components/sign-up-form'
import { useStatus } from '@/hooks/use-status'
import { resolveAuthentication } from '@/lib/auth-session'
import { useAuthStore } from '@/stores/auth-store'

interface HomeAuthPanelProps {
  isAuthenticated: boolean
}

export function HomeAuthPanel(props: HomeAuthPanelProps): ReactElement {
  const { t } = useTranslation()
  const { status } = useStatus()
  const titleId = useId()
  const [selectedTab, setSelectedTab] = useState('sign-in')
  const [isRestoringSession, setIsRestoringSession] = useState(
    () =>
      !props.isAuthenticated &&
      useAuthStore.getState().auth.bootstrapState !== 'complete'
  )
  const registrationEnabled =
    !status?.self_use_mode_enabled && status?.register_enabled !== false
  const activeTab = registrationEnabled ? selectedTab : 'sign-in'

  useEffect(() => {
    if (!isRestoringSession) return

    let mounted = true
    // Keep the public page visible while the existing resolver checks its session.
    void resolveAuthentication().finally(() => {
      if (mounted) setIsRestoringSession(false)
    })
    return () => {
      mounted = false
    }
  }, [isRestoringSession])

  if (props.isAuthenticated) {
    return (
      <section
        className='home-auth-panel home-auth-welcome'
        aria-labelledby={titleId}
      >
        <header className='home-auth-header'>
          <h2 id={titleId} className='home-auth-title'>
            {t('Welcome back!')}
          </h2>
        </header>
        <Button
          className='home-auth-dashboard'
          size='lg'
          role='link'
          render={<Link to='/dashboard' />}
        >
          {t('Go to Dashboard')}
        </Button>
      </section>
    )
  }

  if (isRestoringSession) {
    return (
      <section
        className='home-auth-panel'
        role='status'
        aria-label={t('Sign in')}
        aria-busy='true'
      >
        <LoadingState />
      </section>
    )
  }

  return (
    <section className='home-auth-panel' aria-labelledby={titleId}>
      <header className='home-auth-header'>
        <h2 id={titleId} className='home-auth-title'>
          {activeTab === 'sign-up'
            ? t('Create an account')
            : t('Welcome back!')}
        </h2>
      </header>

      {registrationEnabled ? (
        <Tabs
          value={activeTab}
          onValueChange={(value) => setSelectedTab(String(value))}
          className='home-auth-tabs'
        >
          <TabsList className='home-auth-tab-list'>
            <TabsTrigger value='sign-in'>{t('Sign in')}</TabsTrigger>
            <TabsTrigger value='sign-up'>{t('Sign up')}</TabsTrigger>
          </TabsList>
          <TabsContent value='sign-in' className='home-auth-content'>
            <UserAuthForm />
          </TabsContent>
          <TabsContent value='sign-up' className='home-auth-content'>
            <SignUpForm />
          </TabsContent>
        </Tabs>
      ) : (
        <div className='home-auth-content'>
          <UserAuthForm />
        </div>
      )}

      <TermsFooter
        variant={activeTab === 'sign-up' ? 'sign-up' : 'sign-in'}
        status={status}
        className='home-auth-footer'
      />
    </section>
  )
}
