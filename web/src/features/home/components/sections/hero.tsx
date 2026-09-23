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
import { ArrowRight, Pause, Play } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ProjectAttribution } from '@/components/layout/components/footer'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { BlackHoleBackground } from '../black-hole-background'
import { HomeAuthPanel } from '../home-auth-panel'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

export function Hero(props: HeroProps) {
  const { t, i18n } = useTranslation()
  const [motionPaused, setMotionPaused] = useState(false)

  return (
    <section
      className={cn('event-horizon-hero', props.className)}
      aria-labelledby='home-heading'
      data-motion-paused={motionPaused}
    >
      <BlackHoleBackground paused={motionPaused} />
      <div className='event-horizon-shade' aria-hidden='true' />

      <div className='event-horizon-grid'>
        <div className='event-horizon-copy'>
          <p className='event-horizon-eyebrow'>
            <span aria-hidden='true' />
            {t('One API. Infinite possibilities.')}
          </p>
          <h1
            id='home-heading'
            data-cjk={/^(zh|ja)/.test(i18n.resolvedLanguage ?? i18n.language)}
          >
            <span>{t('Connect intelligence.')}</span>
            <span>{t('Explore the infinite.')}</span>
          </h1>
          <p className='event-horizon-description'>
            <span>{t('One API, a universe of AI models.')}</span>
            <span>{t('Let every creation take you further.')}</span>
          </p>
          <Button
            className='event-horizon-explore'
            variant='link'
            role='link'
            render={<Link to='/pricing' />}
          >
            {t('Explore models')}
            <ArrowRight aria-hidden='true' />
          </Button>
          <ul className='event-horizon-features'>
            <li>{t('Unified API')}</li>
            <li>{t('Multiple models')}</li>
            <li>{t('Pay as you go')}</li>
          </ul>
        </div>

        <div className='event-horizon-panel-wrap'>
          <HomeAuthPanel isAuthenticated={props.isAuthenticated ?? false} />
        </div>
      </div>

      <div className='event-horizon-bottom'>
        <div className='event-horizon-credits'>
          <a
            href='https://github.com/QuantumNous/new-api'
            target='_blank'
            rel='noopener noreferrer'
            className='event-horizon-attribution'
          >
            new-api <span aria-hidden='true'>/</span> QuantumNous
          </a>
          <ProjectAttribution currentYear={new Date().getFullYear()} inline />
        </div>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='event-horizon-motion'
          aria-pressed={motionPaused}
          onClick={() => setMotionPaused((paused) => !paused)}
        >
          {motionPaused ? (
            <Play aria-hidden='true' />
          ) : (
            <Pause aria-hidden='true' />
          )}
          {motionPaused
            ? t('Resume background animation')
            : t('Pause background animation')}
        </Button>
      </div>
    </section>
  )
}
