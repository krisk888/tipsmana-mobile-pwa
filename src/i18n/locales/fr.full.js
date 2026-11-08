// Catalogue « fr » des écrans, chargé en arrière-plan (attendu par le routeur)
const files = import.meta.glob(['./fr/*.json', '!./fr/common.json', '!./fr/ui.json', '!./fr/login.json'], { eager: true, import: 'default' })
export default Object.assign({}, ...Object.values(files))
