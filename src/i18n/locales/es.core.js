// Catalogue « es » minimal, chargé avant le mount : navigation, bandeaux, connexion
const files = import.meta.glob(['./es/common.json', './es/ui.json', './es/login.json'], { eager: true, import: 'default' })
export default Object.assign({}, ...Object.values(files))
