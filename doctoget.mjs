import { 
  GEO_KEY, 
  GEO_PASS, 
  GEO_USER, 
  HOME, 
  URL, 
  MAX_DISTANCE, 
  CONCURRENCY, 
  INTERVAL_CAP, 
  INTERVAL, 
  CACHE,
  OPEN,
} from './config.mjs'
import PQueue from 'p-queue'
import Gp from 'geoportal-access-lib'
import fetch from 'node-fetch'
import { JSDOM } from 'jsdom'
import { map } from 'lodash-es'
import { promises as fsPromise } from 'fs'
import { exec } from 'child_process'

const queue = createQueue()

function createQueue() {
  const concurrency = CONCURRENCY
  const interval = INTERVAL
  const intervalCap = INTERVAL_CAP
  const carryoverConcurrencyCount = true
  return new PQueue({concurrency, interval, intervalCap, carryoverConcurrencyCount})
}

// Hack stupide parce que Gp fait 
// `("__PRODUCTION__".match(/true/)) ? Log.disableAll() : Log.disableAll();`
// et que Node utilise par défaut la version compilée GpServices-src.js fournie par npm
// qui fait `("false".match(/true/)) ? Log.disableAll() : Log.disableAll();`
String.prototype.match_orig = String.prototype.match
String.prototype.match = function (...args) { 
  if ((this.toString() === "__PRODUCTION__" || this.toString() === "false") && (args[0].toString() === "/true/")) return true
  return this.match_orig(...args)
}
// Idem, parce que Gp ne supporte par l'authentification par utilisateur et mot de passe
// On recode la version Node de l'appel
Gp.Protocols.XHR.__call = function (options) {
  var promise = new Promise(
    function (resolve, reject) {
      // traitement du corps de la requête
      var corps = (options.method === "POST" || options.method === "PUT") ? 1 : 0;

      // seulement si options.data n'est pas vide (peut être un objet ou une chaine de caractères)
      if (options.data && ((typeof options.data === "object" && Object.keys(options.data).length) || (typeof options.data === "string" && options.data.length)) && !corps) {
        options.url = Gp.Helper.normalyzeUrl(options.url, options.data);
      }

      var opts = {
        headers : {
          Referer : "https://localhost",
          Authorization: 'Basic ' + Buffer.from(GEO_USER + ":" + GEO_PASS).toString('base64'),
        }
      }
      if (options.data && typeof options.data === "string" && corps) {
        opts = {
          method : options.method,
          body : options.data,
          headers : {
            ...opt.headers,
            "Content-Type" : options.content,
          }
        }
      }

      return fetch(options.url, opts).then(
        function (response) {
          if (response.ok) { // res.status >= 200 && res.status < 300
            resolve(response.text());
          } else {
            var message = "Errors Occured on Http Request (status : '" + response.statusText + "' | url : '" + response.url + "')";
            var status = response.status;
            reject({
              message : message,
              status : status
            });
          }
        }
      ).catch(
        function (e) {
          reject({
            message : e,
            status : -1
          })
        }
      )
    }
  )

  return promise;
}

async function getDistance(dest) {
  return new Promise((resolve, reject) => {
    Gp.Services.route({
      apiKey : GEO_KEY,
      routePreference: "fastest",
      outputFormat: 'json',
      startPoint : { x: HOME.lng, y: HOME.lat},
      endPoint : { x: dest.lng, y: dest.lat },
      graph : "Voiture",
      onSuccess: function (result) {
        resolve(result.totalTime)
      },
      onFailure: function (error) {
        console.error(error)
        reject(error)
      },
      onTimeOut : function () {
        console.error("timeout")
        reject("timeout")
      }
    })
  })
}


async function doctoGet(url) {
  //console.log("request ", url)
  return queue.add(() => fetch(url))
}

function getName(name) {
  return name.replace(/(centre (de )?)?vaccinations?( covid([- ]19)?)?( éphémère)?(( de( l[a’'])?)|( du))?/i, '').replace(/^[-– ]+|[-– ]+$/g, '').trim()
}

async function getCentersForPage(n) {
  const page = (n > 1) ? `&page=${n}` : ''
  const url = `${URL}?force_max_limit=2${page}&ref_visit_motive_ids%5B%5D=6970&ref_visit_motive_ids%5B%5D=7005`
  const response = await doctoGet(url)
  const html = await response.text()
  const dom = new JSDOM(html, { url })
  const centers = dom.window.document.querySelectorAll(".results .dl-search-result")
  return map(centers, center => ({
    id: center.id.match(/\d+/)[0],
    lat: parseFloat(center.getAttribute('data-lat')),
    lng: parseFloat(center.getAttribute('data-lng')),
    url: center.querySelector('.dl-search-result-presentation a.js-search-result-path.dl-button-primary').href,
    name: getName(center.querySelector('.dl-search-result-presentation .dl-search-result-title h3 a.dl-search-result-name div').textContent),
    city: center.querySelector('.dl-search-result-presentation .dl-search-result-content .dl-text-body').textContent.match(/\b\d{2}.?\d\d\d? [^0-9]+$/)[0].trim(),
    date: new Date().toISOString(),
  }))
}


async function getAvailabilitiesForCenter(center) {
  const url = `https://www.doctolib.fr/search_results/${center.id}.json?ref_visit_motive_ids%5B%5D=6970&ref_visit_motive_ids%5B%5D=7005&speciality_id=5494&search_result_format=json&force_max_limit=2`
  const response = await doctoGet(url)
  return response.json()
}


function showAvailabilities(center, availabilities) {
  console.group(center.name, " ", Math.round(center.distance / 60).toString() + " min. ", `(${availabilities.total})`)
  console.log(center.url)
  availabilities.availabilities.map(av => {
    if (av.slots.length > 0) {
      console.log(av.date, av.slots.map(slot => slot.start_date.match(/T\d\d:\d\d/)[0].replace(':', 'h').replace(/^T0?/, '')).join(', '))
    }
  })
  console.groupEnd()
  exec(`${OPEN} '${center.url}'`)
}

async function searchAvailabilitiesForCenter(center) {
  if (center.distance < MAX_DISTANCE) {
    const availabilities = await getAvailabilitiesForCenter(center)
    if (availabilities.total > 0) {
      await showAvailabilities(center, availabilities)
    } else {
      // console.log(center.name, " has 0 slot - ", Math.round(center.distance / 60) + " min.")
    }
  } else {
    // console.log(center.name, " is too far : ", center.city, " - ", Math.round(center.distance / 60) + " min.")
  }
}

async function searchAvailabilitiesForPage(page, cache) {
  const centers = await getCentersForPage(page)
  const nearestCenters = centers.filter(center => !cache[center.id])
  await Promise.all(
    nearestCenters.map(async center => { 
      center.distance = await getDistance(center)
      console.log(`Nouveau centre trouvé : ${center.name} à ${center.city} (${Math.round(center.distance / 60)} min.)`)
      cache[center.id] = center
      await searchAvailabilitiesForCenter(center)
    })
  )
}

async function searchNewCenters(cache) {
  const pages = [1, 2, 3, 4, 5, 6, 7, 8, 9]  
  await Promise.all(
    pages.map(page => searchAvailabilitiesForPage(page, cache))
  )
}

async function exploreCache(cache) {
  await Promise.all(
    Object.values(cache).sort((a,b) => a.distance - b.distance).map(searchAvailabilitiesForCenter)
  )
}

async function loadCache() {
  try {
    const json = await fsPromise.readFile(CACHE, { encoding: 'utf8'})
    return Object.fromEntries(JSON.parse(json))
  } catch(e) {
    return {}
  }
}

async function writeCache(cache) {
  const data = Object.entries(cache).sort((a,b) => a[1].distance - b[1].distance)
  const json = JSON.stringify(data, null, 2)
  await fsPromise.writeFile(CACHE, json)
}

async function main() {
  const cache = await loadCache()
  await exploreCache(cache)
  try {
    await searchNewCenters(cache)
  } finally {
    await writeCache(cache)
  }
  console.log(".")
}

main()