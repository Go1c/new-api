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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axios from 'axios'
import i18next from 'i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { SystemStatus } from '@/features/auth/types'
import zhLocale from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'
import { bootstrapAuthentication } from '@/lib/auth-session'
import { Route as HomeRoute } from '@/routes/index'
import { useAuthStore } from '@/stores/auth-store'

import { HomeAuthPanel } from '../home-auth-panel'

const queryClients: QueryClient[] = []

function renderPanel(
  status: SystemStatus = {},
  isAuthenticated = false,
  showAuthPanel = true
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClients.push(queryClient)
  queryClient.setQueryData(['status'], {
    register_enabled: true,
    password_login_enabled: true,
    ...status,
  })
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: Outlet,
  })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/',
        // Include route guards so an auth wait cannot silently block the public page.
        beforeLoad: HomeRoute.options.beforeLoad as
          | (() => Promise<void>)
          | undefined,
        component: function PanelRoute() {
          const hasSession = useAuthStore((state) => Boolean(state.auth.user))
          return (
            <>
              <h1>Public homepage content</h1>
              {showAuthPanel && (
                <HomeAuthPanel
                  isAuthenticated={isAuthenticated || hasSession}
                />
              )}
            </>
          )
        },
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/dashboard',
        component: () => <h1>Dashboard destination</h1>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/otp',
        component: () => <h1>Verification destination</h1>,
      }),
    ]),
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { queryClient, router }
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  useAuthStore.getState().auth.reset('complete')
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  for (const client of queryClients.splice(0)) client.clear()
  delete window.turnstile
  document.querySelector('#cf-turnstile')?.remove()
  useAuthStore.getState().auth.reset('idle')
  localStorage.clear()
  vi.restoreAllMocks()
})

it('switches between the real sign-in and registration fields', async () => {
  renderPanel({ email_verification: true })
  const user = userEvent.setup()

  expect(await screen.findByLabelText('Username or Email')).toBeVisible()
  expect(screen.getByRole('tab', { name: 'Sign in' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await user.click(screen.getByRole('tab', { name: 'Sign up' }))
  expect(await screen.findByLabelText('Confirm password')).toBeVisible()
  expect(
    screen.getByLabelText('Email (required for verification)')
  ).toBeVisible()
  expect(screen.queryByLabelText('Username or Email')).not.toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Sign up' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  await user.click(screen.getByRole('tab', { name: 'Sign in' }))
  expect(await screen.findByLabelText('Username or Email')).toBeVisible()
  expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument()
})

it('lets keyboard users select the registration tab', async () => {
  renderPanel()
  const user = userEvent.setup()
  const signInTab = await screen.findByRole('tab', { name: 'Sign in' })
  signInTab.focus()

  await user.keyboard('{ArrowRight}{Enter}')

  expect(screen.getByRole('tab', { name: 'Sign up' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(await screen.findByLabelText('Confirm password')).toBeVisible()
})

it.each([{ register_enabled: false }, { self_use_mode_enabled: true }])(
  'hides registration when the server policy is %j',
  async (status) => {
    renderPanel(status)

    expect(await screen.findByLabelText('Username or Email')).toBeVisible()
    expect(
      screen.queryByRole('tab', { name: 'Sign up' })
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument()
  }
)

it('returns to sign-in when registration is disabled while its tab is open', async () => {
  const { queryClient } = renderPanel()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('tab', { name: 'Sign up' }))
  expect(await screen.findByLabelText('Confirm password')).toBeVisible()

  await act(async () => {
    queryClient.setQueryData(['status'], { register_enabled: false })
  })

  expect(await screen.findByLabelText('Username or Email')).toBeVisible()
  expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: 'Sign up' })).not.toBeInTheDocument()
})

it('requires legal consent independently for sign-in and registration', async () => {
  renderPanel({ user_agreement_enabled: true, privacy_policy_enabled: true })
  const user = userEvent.setup()
  const signInButton = await screen.findByRole('button', { name: 'Sign in' })

  expect(signInButton).toBeDisabled()
  await user.click(screen.getByRole('checkbox'))
  expect(signInButton).toBeEnabled()

  await user.click(screen.getByRole('tab', { name: 'Sign up' }))
  const createButton = await screen.findByRole('button', {
    name: 'Create account',
  })
  expect(createButton).toBeDisabled()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(screen.getByRole('checkbox'))
  expect(createButton).toBeEnabled()
})

it('shows translated Chinese agreement text and links in both auth tabs', async () => {
  const previousLanguage = i18next.language
  const previousResources = i18next.hasResourceBundle('zh', 'translation')
    ? structuredClone(i18next.getResourceBundle('zh', 'translation'))
    : undefined
  const translations: Record<string, string> = zhLocale.translation
  const legalKeys = [
    'By clicking sign in, you agree to our',
    'By creating an account, you agree to our',
    'I have read and agree to the',
    'User Agreement',
    'Privacy Policy',
    'Sign in',
    'Sign up',
    'and',
  ]
  i18next.addResourceBundle(
    'zh',
    'translation',
    Object.fromEntries(legalKeys.map((key) => [key, translations[key]]))
  )

  try {
    await i18next.changeLanguage('zh')
    renderPanel({ user_agreement_enabled: true, privacy_policy_enabled: true })
    const user = userEvent.setup()

    expect(
      await screen.findByRole('checkbox', {
        name: /我已阅读并同意.*用户协议.*和.*隐私政策/,
      })
    ).toBeVisible()
    expect(
      screen.getByText(translations['By clicking sign in, you agree to our'], {
        exact: false,
      })
    ).toHaveTextContent('用户协议 和 隐私政策')
    for (const link of screen.getAllByRole('link', { name: '用户协议' })) {
      expect(link).toHaveAttribute('href', '/user-agreement')
    }
    for (const link of screen.getAllByRole('link', { name: '隐私政策' })) {
      expect(link).toHaveAttribute('href', '/privacy-policy')
    }

    await user.click(screen.getByRole('tab', { name: '注册' }))

    expect(
      screen.getByText(
        translations['By creating an account, you agree to our'],
        {
          exact: false,
        }
      )
    ).toHaveTextContent('用户协议 和 隐私政策')
    expect(
      screen.queryByText(/By clicking sign in|By creating an account/)
    ).not.toBeInTheDocument()
  } finally {
    cleanup()
    i18next.removeResourceBundle('zh', 'translation')
    if (previousResources) {
      i18next.addResourceBundle('zh', 'translation', previousResources)
    }
    await i18next.changeLanguage(previousLanguage)
  }
})

it('keeps Turnstile verification required before sending a password login', async () => {
  let verify: ((token: string) => void) | undefined
  window.turnstile = {
    render: (_element, options) => {
      verify = options.callback as (token: string) => void
    },
  }
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: false, message: 'Invalid credentials' },
  })
  renderPanel({ turnstile_check: true, turnstile_site_key: 'test-site-key' })
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Username or Email'), 'explorer')
  await user.type(screen.getByLabelText('Password'), 'example-password')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(post).not.toHaveBeenCalled()

  await act(async () => verify?.('verified-challenge'))
  await user.click(screen.getByRole('button', { name: 'Sign in' }))

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/user/login?turnstile=verified-challenge',
      { username: 'explorer', password: 'example-password' },
      { skipAuthRefresh: true }
    )
  )
})

it('preserves configured OAuth and Passkey choices when password login is disabled', async () => {
  renderPanel({
    password_login_enabled: false,
    github_oauth: true,
    github_client_id: 'test-github-app',
    passkey_login: true,
  })

  expect(await screen.findByRole('button', { name: /GitHub/ })).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Sign in with Passkey' })
  ).toBeVisible()
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
})

it('routes a password MFA challenge to verification without authenticating', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: true,
      data: {
        require_verification: true,
        flow_token: 'home-login-challenge',
        expires_at: Math.floor(Date.now() / 1000) + 300,
        methods: [{ method: '2fa', available: true }],
      },
    },
  })
  const { router } = renderPanel()
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Username or Email'), 'explorer')
  await user.type(screen.getByLabelText('Password'), 'example-password')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))

  expect(
    await screen.findByRole('heading', { name: 'Verification destination' })
  ).toBeVisible()
  expect(router.state.location.pathname).toBe('/otp')
  expect(useAuthStore.getState().auth.user).toBeNull()
  expect(
    useAuthStore.getState().auth.pendingLoginVerification?.challenge.flow_token
  ).toBe('home-login-challenge')
})

it('keeps the sign-in form available without authenticating after a server failure', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockRejectedValue(new Error('Service unavailable'))
  const { router } = renderPanel()
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Username or Email'), 'explorer')
  await user.type(screen.getByLabelText('Password'), 'example-password')
  const signInButton = screen.getByRole('button', { name: 'Sign in' })

  await user.click(signInButton)

  await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(signInButton).toBeEnabled())
  expect(router.state.location.pathname).toBe('/')
  expect(useAuthStore.getState().auth.user).toBeNull()
  expect(useAuthStore.getState().auth.pendingLoginVerification).toBeNull()
})

it('rejects an expired MFA challenge without navigating or authenticating', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: true,
      data: {
        require_verification: true,
        flow_token: 'expired-home-challenge',
        expires_at: 1,
        methods: [{ method: '2fa', available: true }],
      },
    },
  })
  const { router } = renderPanel()
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Username or Email'), 'explorer')
  await user.type(screen.getByLabelText('Password'), 'example-password')
  const signInButton = screen.getByRole('button', { name: 'Sign in' })

  await user.click(signInButton)

  await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(signInButton).toBeEnabled())
  expect(router.state.location.pathname).toBe('/')
  expect(useAuthStore.getState().auth.user).toBeNull()
  expect(useAuthStore.getState().auth.pendingLoginVerification).toBeNull()
})

it('shows a dashboard entry instead of credential fields for authenticated users', async () => {
  const { router } = renderPanel({}, true)
  const user = userEvent.setup()
  const dashboardLink = await screen.findByRole('link', {
    name: 'Go to Dashboard',
  })

  expect(screen.getByRole('heading', { name: 'Welcome back!' })).toBeVisible()
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  expect(dashboardLink).toHaveAttribute('href', '/dashboard')
  await user.click(dashboardLink)
  await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
})

it.each([true, false])(
  'keeps public content renderable while session refresh is unresolved (auth panel: %s)',
  async (showAuthPanel) => {
    useAuthStore.getState().auth.reset('idle')
    document.cookie = 'new_api_has_session=; Max-Age=0; Path=/'
    let finishRefresh!: (response: {
      status: number
      data: { success: boolean }
    }) => void
    const pending = new Promise<{ status: number; data: { success: boolean } }>(
      (resolve) => {
        finishRefresh = resolve
      }
    )
    const request = vi
      .spyOn(axios.Axios.prototype, 'request')
      .mockReturnValue(pending)

    try {
      renderPanel({}, false, showAuthPanel)

      expect(
        await screen.findByRole('heading', { name: 'Public homepage content' })
      ).toBeVisible()
      expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
      if (showAuthPanel) {
        expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
        expect(request).toHaveBeenCalledWith(
          expect.objectContaining({ url: '/api/user/auth/refresh' })
        )
      } else {
        expect(request).not.toHaveBeenCalled()
      }
    } finally {
      await act(async () => {
        finishRefresh({ status: 401, data: { success: false } })
        await pending
      })
    }

    if (showAuthPanel) {
      expect(await screen.findByLabelText('Password')).toBeVisible()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    }
  }
)

it('restores a valid server session without a hint cookie in the homepage auth panel', async () => {
  useAuthStore.getState().auth.reset('idle')
  document.cookie = 'new_api_has_session=; Max-Age=0; Path=/'
  const request = vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValue({
    status: 200,
    data: {
      success: true,
      data: {
        access_token: 'restored-home-access',
        token_type: 'Bearer',
        access_expires_at: 9999999999,
        user: { id: 42, username: 'returning-explorer', role: 1 },
        session: {
          sid: 'restored-home-session',
          current: true,
          login_method: 'password',
          ip: '',
          user_agent: '',
          created_at: 1,
          last_active_at: 1,
          expires_at: 9999999999,
        },
      },
    },
  })
  await bootstrapAuthentication()
  expect(request).not.toHaveBeenCalled()

  renderPanel()

  expect(
    await screen.findByRole('link', { name: 'Go to Dashboard' })
  ).toBeVisible()
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  expect(useAuthStore.getState().auth.user?.username).toBe('returning-explorer')
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({ url: '/api/user/auth/refresh' })
  )
})
