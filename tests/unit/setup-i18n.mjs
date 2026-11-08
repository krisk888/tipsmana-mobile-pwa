// Catalogues chargés synchroniquement pour les tests (l'app les charge à la demande)
import { registerMessages } from '../../src/i18n'

const files = import.meta.glob('../../src/i18n/locales/*/*.json', { eager: true, import: 'default' })
for (const [path, catalog] of Object.entries(files)) {
  registerMessages(path.split('/').at(-2), catalog)
}
