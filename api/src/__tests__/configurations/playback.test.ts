import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

/**
 * The Vault agent injector hands secrets to the pod as FILES, not env vars, so
 * the config has to read `<NAME>_FILE` before `<NAME>`. Everything else — local
 * runs, docker-compose, these tests — still uses the plain env var.
 */
describe('config secrets from files', () => {
  const ENV = {...process.env}
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-secrets-'))
    jest.resetModules()
  })

  afterEach(() => {
    process.env = {...ENV}
    fs.rmSync(dir, {recursive: true, force: true})
  })

  const write = (name: string, value: string) => {
    const file = path.join(dir, name)
    fs.writeFileSync(file, value)
    return file
  }

  it('prefers the file over the env var, and trims the trailing newline', () => {
    process.env.DB_PASSWORD = 'from-env'
    // the agent template ends with a newline; the password does not include it
    process.env.DB_PASSWORD_FILE = write('db-password', 'from-vault\n')

    const {db} = require('@/configurations/playback')
    expect(db.password).toBe('from-vault')
  })

  it('falls back to the env var when the file is missing', () => {
    process.env.DB_USER = 'postgres'
    process.env.DB_USER_FILE = path.join(dir, 'never-written')

    const {db} = require('@/configurations/playback')
    expect(db.username).toBe('postgres')
  })

  it('falls back to the env var when the file is empty', () => {
    process.env.DB_USER = 'postgres'
    process.env.DB_USER_FILE = write('db-user', '   \n')

    const {db} = require('@/configurations/playback')
    expect(db.username).toBe('postgres')
  })

  it('reads the kafka brokers from a file and splits them', () => {
    delete process.env.KAFKA_BROKERS
    process.env.KAFKA_BROKERS_FILE = write('kafka-brokers', 'a:29092, b:29092\n')

    const {kafka} = require('@/configurations/playback')
    expect(kafka.brokers).toEqual(['a:29092', 'b:29092'])
    expect(kafka.enabled).toBe(true)
  })

  it('stays disabled when neither the file nor the env var is set', () => {
    delete process.env.KAFKA_BROKERS
    delete process.env.KAFKA_BROKERS_FILE
    delete process.env.DB_HOST

    const {kafka, db} = require('@/configurations/playback')
    expect(kafka.enabled).toBe(false)
    expect(db.enabled).toBe(false)
  })
})
