// Catalogue « es » des écrans, chargé en arrière-plan (attendu par le routeur)
const files = import.meta.glob(['./es/*.json', '!./es/common.json', '!./es/ui.json', '!./es/login.json'], { eager: true, import: 'default' })
export default Object.assign({}, ...Object.values(files))
