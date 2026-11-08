// Catalogue « en » des écrans, chargé en arrière-plan (attendu par le routeur)
const files = import.meta.glob(['./en/*.json', '!./en/common.json', '!./en/ui.json', '!./en/login.json'], { eager: true, import: 'default' })
export default Object.assign({}, ...Object.values(files))
