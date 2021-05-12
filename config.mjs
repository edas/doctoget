// Codes geoportail pour le calcul des temps de trajet.
// On peut demander à créer une nouvelle clef sur le lien suivant
// https://geoservices.ign.fr/documentation/diffusion/formulaire-de-commande-geoservices.html 
// Demander une clef pour un SIG, ressources gratuites
// et sécurisation par utilisateur et mot de passe.
// Ils m'ont répondu en moins de 24h.
const GEO_KEY = "xxx"
const GEO_USER = "xxx"
const GEO_PASS = "xxx"

// Coordonnées du domicile (à modifier)
const HOME = {lng: 4.12345, lat: 45.12345 }
// Page de recherche Doctolib à adapter suivant la localisation
// (faire une recherche et recopier l'adresse)
const URL = 'https://www.doctolib.fr/vaccination-covid-19/lyon'

// Temps de trajet max en voiture (en secondes)
const MAX_DISTANCE = 35 * 60

// Nombre de requêtes à Doctolib en parallèle
const CONCURRENCY = 1
// Nombre de requêtes par intervale de temps
const INTERVAL_CAP = 1
// Intervale de temps en millisecondes
const INTERVAL = 300

// Fichier de cache pour limiter les appels
// aux itinéraire et repartir des centres 
// proches connus en premier
const CACHE = "cache.json"

// Commande pour ouvrir un lien dans le shell
// mac : "open" ou "open -a Firefox"
const OPEN = "open"

export { GEO_KEY, GEO_PASS, GEO_USER, HOME, URL, MAX_DISTANCE, CONCURRENCY, INTERVAL_CAP, INTERVAL, CACHE, OPEN }