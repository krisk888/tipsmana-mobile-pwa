// Catalogue « fr » minimal, chargé avant le mount : navigation, bandeaux, connexion
const files = import.meta.glob(['./fr/common.json', './fr/ui.json', './fr/login.json'], { eager: true, import: 'default' })
export default Object.assign({}, ...Object.values(files))
