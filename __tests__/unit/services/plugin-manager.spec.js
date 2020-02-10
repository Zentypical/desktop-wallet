import { createLocalVue } from '@vue/test-utils'
import { PluginManager } from '@/services/plugin-manager'
import { PluginSandbox } from '@/services/plugin-manager/plugin-sandbox'
import { PluginSetup } from '@/services/plugin-manager/plugin-setup'

jest.mock('@/services/plugin-manager/plugin-sandbox.js')
jest.mock('@/services/plugin-manager/plugin-setup.js')

jest.mock('fs-extra', () => ({
  ensureDirSync: jest.fn(),
  readdirSync: jest.fn(() => []),
  lstatSync: jest.fn(() => ({
    isDirectory: jest.fn(() => true)
  }))
}))

jest.mock('@/services/plugin-manager/utils/validate-plugin-path.js', () => ({
  validatePluginPath: jest.fn()
}))

const mockDispatch = jest.fn()
const mockSandboxInstall = jest.fn()
const mockSandboxSetup = jest.fn()

PluginSandbox.mockImplementation(() => ({
  install: mockSandboxInstall
}))

PluginSetup.mockImplementation(() => ({
  install: mockSandboxSetup
}))

const localVue = createLocalVue()

const pkg = {
  name: 'plugin-test',
  description: 'Test',
  title: 'Plugin Test',
  version: '0.0.1'
}

const app = {
  $store: {
    dispatch: mockDispatch,
    getters: {
      'plugin/isEnabled': jest.fn((pluginId) => pluginId === 'plugin-test'),
      'plugin/isInstalledSupported': jest.fn(() => true),
      'plugin/lastFetched': jest.fn(() => 0),
      'profile/byId': jest.fn(() => {}),
      'session/pluginAdapter': 'npm'
    }
  }
}

let pluginManager

beforeEach(() => {
  mockDispatch.mockReset()
  pluginManager = new PluginManager()
  pluginManager.setVue(localVue)
  pluginManager.setAdapter('npm')
  pluginManager.setApp(app)
})

describe('Plugin Manager', () => {
  it('should load plugins on init', async () => {
    await pluginManager.init(app)
    expect(app.$store.dispatch).toHaveBeenNthCalledWith(1, 'plugin/reset')
    expect(app.$store.dispatch).toHaveBeenNthCalledWith(2, 'plugin/loadPluginsForProfiles')
  })

  describe('Fetch plugins', () => {
    it('should fetch plugins from path', async () => {
      jest.spyOn(pluginManager, 'fetchPluginsFromPath')

      await pluginManager.fetchPlugins()
      expect(pluginManager.fetchPluginsFromPath).toHaveBeenCalled()
    })

    it('should fetch plugins from adapter if forced', async () => {
      jest.spyOn(pluginManager, 'fetchPluginsFromAdapter').mockReturnValue({})

      await pluginManager.fetchPlugins(true)
      expect(pluginManager.fetchPluginsFromAdapter).toHaveBeenCalled()
    })
  })

  describe('Enable plugin', () => {
    it('should throw not initiated error', async () => {
      expect.assertions(1)
      try {
        await pluginManager.enablePlugin('plugin-1', 'p-1')
      } catch (e) {
        expect(e.message).toBe('Plugin Manager not initiated')
      }
    })

    it('should throw not found error', async () => {
      expect.assertions(1)
      await pluginManager.init(app)
      try {
        await pluginManager.enablePlugin('plugin-not-loaded', 'p-1')
      } catch (e) {
        expect(e.message).toBe('Plugin \'plugin-not-loaded\' not found')
      }
    })

    it('should throw not enabled error', async () => {
      expect.assertions(2)
      await pluginManager.init(app)
      pluginManager.plugins = {
        'plugin-not-enabled': {
          config: {
            id: '1'
          }
        }
      }
      try {
        await pluginManager.enablePlugin('plugin-not-enabled', 'p-1')
      } catch (e) {
        expect(e.message).toBe('Plugin \'1\' is not enabled')
        expect(app.$store.getters['plugin/isEnabled']).toHaveBeenCalled()
      }
    })

    it('should enable', async () => {
      await pluginManager.init(app)

      pluginManager.plugins = {
        [pkg.name]: {
          config: {
            id: pkg.name
          },
          fullPath: './test'
        }
      }

      await pluginManager.enablePlugin(pkg.name, 'p-1')
      expect(mockDispatch).toHaveBeenCalledWith('plugin/setLoaded', expect.any(Object))
      expect(mockSandboxInstall).toHaveBeenCalled()
      expect(mockSandboxSetup).toHaveBeenCalled()
    })
  })

  describe('Disable plugin', () => {
    it('should throw not initiated error', async () => {
      expect.assertions(1)
      try {
        await pluginManager.disablePlugin('plugin-1', 'p-1')
      } catch (e) {
        expect(e.message).toBe('Plugin Manager not initiated')
      }
    })

    it('should throw not found error', async () => {
      expect.assertions(1)
      await pluginManager.init(app)
      try {
        await pluginManager.disablePlugin('plugin-not-loaded', 'p-1')
      } catch (e) {
        expect(e.message).toBe('Plugin \'plugin-not-loaded\' not found')
      }
    })

    it('should disable', async () => {
      await pluginManager.init(app)
      pluginManager.plugins = {
        [`${pkg.name}-disabled`]: {
          config: {
            id: `${pkg.name}-disabled`,
            permissions: []
          }
        }
      }
      pluginManager.pluginSetups = {
        [`${pkg.name}-disabled`]: {
          destroy: jest.fn()
        }
      }

      await pluginManager.disablePlugin(`${pkg.name}-disabled`, 'p-1')
      expect(mockDispatch).toHaveBeenCalledWith('plugin/deleteLoaded', { pluginId: `${pkg.name}-disabled`, profileId: 'p-1' })
      expect(pluginManager.pluginSetups[`${pkg.name}-disabled`].destroy).toHaveBeenCalledTimes(1)
    })

    it('should unload theme', async () => {
      await pluginManager.init(app)
      pluginManager.plugins = {
        [`${pkg.name}-disabled`]: {
          config: {
            id: `${pkg.name}-disabled`,
            permissions: ['THEMES']
          }
        }
      }
      pluginManager.pluginSetups = {
        [`${pkg.name}-disabled`]: {
          destroy: jest.fn()
        }
      }

      await pluginManager.disablePlugin(`${pkg.name}-disabled`, 'p-1')
      expect(mockDispatch).toHaveBeenCalledWith('plugin/deleteLoaded', { pluginId: `${pkg.name}-disabled`, profileId: 'p-1' })
      expect(mockDispatch).toHaveBeenCalledWith('session/setTheme', expect.any(String))
      expect(mockDispatch).toHaveBeenCalledWith('profile/update', expect.any(Object))
      expect(pluginManager.pluginSetups[`${pkg.name}-disabled`].destroy).toHaveBeenCalledTimes(1)
    })
  })
})
