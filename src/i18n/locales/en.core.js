// Catalogue « en » minimal, chargé avant le mount : navigation, bandeaux, connexion
const files = import.meta.glob(['./en/common.json', './en/ui.json', './en/login.json'], { eager: true, import: 'default' })
export default Object.assign({}, ...Object.values(files))
