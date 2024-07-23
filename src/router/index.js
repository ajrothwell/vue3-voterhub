import { createRouter, createWebHistory } from 'vue-router';
import App from '@/App.vue';
import $config from '@/config';

import { useGeocodeStore } from '@/stores/GeocodeStore.js'
import { useCondosStore } from '@/stores/CondosStore.js'
import { useParcelsStore } from '@/stores/ParcelsStore.js'
import { useOpaStore } from '@/stores/OpaStore.js'
import { useDorStore } from '@/stores/DorStore.js'
import { useBallotsStore } from '@/stores/BallotsStore.js'
import { usePollingPlaceStore } from '@/stores/PollingPlaceStore.js'
import { useMailinVotingStore } from '@/stores/MailinVotingStore.js'
import { useElectedOfficialsStore } from '@/stores/ElectedOfficialsStore'
import { useNearbyActivityStore } from '@/stores/NearbyActivityStore.js'
import { useMainStore } from '@/stores/MainStore.js'

import useRouting from '@/composables/useRouting';
const { routeApp } = useRouting();

// this runs on address search and as part of datafetch()
const getGeocodeAndPutInStore = async(address) => {
  if (import.meta.env.VITE_DEBUG == 'true') console.log('getGeocodeAndPutInStore is running, address:', address);
  const MainStore = useMainStore();
  MainStore.clearDataSourcesLoadedArray();

  const OpaStore = useOpaStore();
  OpaStore.clearAllOpaData();
  const DorStore = useDorStore();
  DorStore.clearAllDorData();
  const BallotsStore = useBallotsStore();
  BallotsStore.clearAllBallotsData();
  const PollingPlaceStore = usePollingPlaceStore();
  PollingPlaceStore.clearAllPollingPlaceData();
  const MailinVotingStore = useMailinVotingStore();
  MailinVotingStore.clearAllMailinVotingData();
  const ElectedOfficialsStore = useElectedOfficialsStore();
  ElectedOfficialsStore.clearAllElectedOfficialsData();

  const NearbyActivityStore = useNearbyActivityStore();
  NearbyActivityStore.clearAllNearbyActivityData();

  const CondosStore = useCondosStore();
  CondosStore.lastPageUsed = 1;
  CondosStore.condosData.pages = { page_1: { features: [] } };
  const GeocodeStore = useGeocodeStore();
  await GeocodeStore.fillAisData(address);
  if (MainStore.lastSearchMethod == 'address' && !GeocodeStore.aisData.features) {
    MainStore.currentAddress = null;
    if (import.meta.env.VITE_DEBUG == 'true') console.log('getGeocodeAndPutInStore, calling not-found');
    router.push({ name: 'not-found' });
    return;
  } else if (!GeocodeStore.aisData.features) {
    return;
  }
  const currentAddress = GeocodeStore.aisData.features[0].properties.street_address;
  MainStore.setCurrentAddress(currentAddress);
}

// this ONLY runs on map click
const getParcelsAndPutInStore = async(lng, lat) => {
  if (import.meta.env.VITE_DEBUG == 'true') console.log('getParcelsAndPutInStore is running');
  let currentAddress;
  const MainStore = useMainStore();
  let currentTopic = MainStore.currentTopic;
  const parcelLayer = $config.parcelLayerForTopic[currentTopic] || 'pwd';
  // const otherLayer = parcelLayer === 'pwd' ? 'dor' : 'pwd';
  const ParcelsStore = useParcelsStore();
  await ParcelsStore.checkParcelDataByLngLat(lng, lat, 'pwd');
  await ParcelsStore.checkParcelDataByLngLat(lng, lat, 'dor');
  if (parcelLayer === 'dor' && !Object.keys(ParcelsStore.dorChecked).length) {
    return;
  } else if (parcelLayer === 'pwd' && !Object.keys(ParcelsStore.pwdChecked).length) {
    return;
  }
  ParcelsStore.pwd = ParcelsStore.pwdChecked;
  ParcelsStore.dor = ParcelsStore.dorChecked;
  
  const addressField = parcelLayer === 'pwd' ? 'ADDRESS' : 'ADDR_SOURCE';
  if (import.meta.env.VITE_DEBUG == 'true') console.log('parcelLayer:', parcelLayer);
  if (ParcelsStore[parcelLayer].features) {
    for (let i = 0; i < ParcelsStore[parcelLayer].features.length; i++) {
      if (ParcelsStore[parcelLayer].features[i].properties[addressField] !== ' ') {
        currentAddress = ParcelsStore[parcelLayer].features[i].properties[addressField];
        break;
      }
    }
  }
  if (currentAddress) MainStore.setCurrentAddress(currentAddress);
}

// this is called on every route change, including address searches, topic changes, initial app load, and back button clicks
// when it is called, it may have some of the data it needs already in the store (after a geocode), or it may need to fetch everything (e.g. initial app load)
const dataFetch = async(to, from) => {
  if (import.meta.env.VITE_DEBUG == 'true') console.log('dataFetch is starting, to:', to, 'from:', from, 'to.params.address:', to.params.address, 'from.params.address:', from.params.address, 'to.params.topic:', to.params.topic, 'from.params.topic:', from.params.topic);
  const MainStore = useMainStore();
  MainStore.datafetchRunning = true;
  const GeocodeStore = useGeocodeStore();
  const ParcelsStore = useParcelsStore();
  const dataSourcesLoadedArray = MainStore.dataSourcesLoadedArray;
  if (to.name === 'not-found') {
    MainStore.datafetchRunning = false;
    return;
  }

  if (to.name === 'address') {
    MainStore.currentTopic = '';
  } else {
    if (!MainStore.currentTopic && to.params.topic) {
      MainStore.currentTopic = to.params.topic.toLowerCase();
    }
  }
  
  let address, topic;
  if (to.params.address) { address = to.params.address } else if (to.query.address) { address = to.query.address }
  if (to.params.topic) { topic = to.params.topic.toLowerCase() }

  if (import.meta.env.VITE_DEBUG == 'true') console.log('address:', address, 'to.params.address:', to.params.address, 'from.params.address:', from.params.address, 'GeocodeStore.aisData.normalized:', GeocodeStore.aisData.normalized);
  
  let routeAddressChanged = to.params.address !== from.params.address;

  if (routeAddressChanged) {
    // if there is no geocode or the geocode does not match the address in the route, get the geocode
    if (!GeocodeStore.aisData.normalized || GeocodeStore.aisData.normalized && GeocodeStore.aisData.normalized !== address) {
      await getGeocodeAndPutInStore(address);
    }
    // if this was NOT started by a map click, get the parcels
    if (MainStore.lastSearchMethod !== 'mapClick') {
      if (import.meta.env.VITE_DEBUG == 'true') console.log('dataFetch, inside if routeAddressChanged:', routeAddressChanged);
      await ParcelsStore.fillPwdParcelData();
      await ParcelsStore.fillDorParcelData();
    }

  } else if (to.params.topic !== 'nearby' && dataSourcesLoadedArray.includes(topic)) {
    MainStore.datafetchRunning = false;
    return;
  } else if (to.params.topic === 'nearby' && dataSourcesLoadedArray.includes(to.params.data)) {
    MainStore.currentNearbyDataType = to.params.data;
    if (import.meta.env.VITE_DEBUG == 'true') console.log('dataFetch is still going, MainStore.currentNearbyDataType:', MainStore.currentNearbyDataType, 'to.params.data:', to.params.data);
    MainStore.datafetchRunning = false;
    return;
  }
  
  // check for condos
  const CondosStore = useCondosStore();
  CondosStore.loadingCondosData = true;
  await CondosStore.fillCondoData(address);
  CondosStore.loadingCondosData = false;

  // if the topic is condos and the address changes and there are no condos, reroute to property
  if (to.params.topic == "condos" && !CondosStore.condosData.pages.page_1.features.length) {
    MainStore.currentTopic = "property";
    router.push({ name: 'address-and-topic', params: { address: to.params.address, topic: 'property' } });
    MainStore.datafetchRunning = false;
    return;
  }

  MainStore.lastSearchMethod = null;
  MainStore.datafetchRunning = false;

  if (to.name !== 'topic') {
    await topicDataFetch(to.params.topic, to.params.data);
    if (to.params.topic) {
      MainStore.addToDataSourcesLoadedArray(to.params.topic.toLowerCase());
    }
  }
}

const topicDataFetch = async (topic, data) => {
  if (import.meta.env.VITE_DEBUG == 'true') console.log('topicDataFetch is running, topic:', topic);
  
  if (topic && topic.toLowerCase() === 'elections-and-ballots') {
    const BallotsStore = useBallotsStore();
    await BallotsStore.fillAllBallotsData();
    BallotsStore.loadingBallotsData = false;
  }

  if (topic && topic.toLowerCase() === 'polling-place') {
    const PollingPlaceStore = usePollingPlaceStore();
    await PollingPlaceStore.fillAllPollingPlaceData();
    PollingPlaceStore.loadingPollingPlaceData = false;
  }

  if (topic && topic.toLowerCase() === 'mail-in-voting') {
    const MailInPollingPlaceStore = useMailinVotingStore();
    await MailInPollingPlaceStore.fillAllMailinVotingData();
    MailInPollingPlaceStore.loadingData = false;
  }

  if (topic && topic.toLowerCase() === 'elected-officials') {
    const ElectedOfficialsStore = useElectedOfficialsStore();
    await ElectedOfficialsStore.fillAllElectedOfficialsData();
    ElectedOfficialsStore.loadingElectedOfficialsData = false;
  }

}

const router = createRouter({
  // history: createWebHashHistory(import.meta.env.BASE_URL),
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: () => import('@/components/NotFound.vue')
    },
    {
      path: '/',
      name: 'home',
      component: App,
      props: true,
    },
    {
      path: '/:addressOrTopic',
      name: 'address-or-topic',
      component: App,
      beforeEnter: async (to, from) => {
        if (import.meta.env.VITE_DEBUG === 'true') console.log('address-or-topic route beforeEnter, to:', to, 'from:', from, to.params.addressOrTopic.toLowerCase());
        const MainStore = useMainStore();
        const topics = [ 'elections-and-ballots', 'polling-place', 'mail-in-voting', 'elected-officials' ];
        if (topics.includes(to.params.addressOrTopic.toLowerCase())) {
          if (import.meta.env.VITE_DEBUG === 'true') console.log('inside if, routing to topic');
          MainStore.currentTopic = to.params.addressOrTopic;
          MainStore.currentLang = to.query.lang;
          routeApp(router);
        } else {
          if (import.meta.env.VITE_DEBUG === 'true') console.log('inside else, routing to address');
          MainStore.currentTopic = null;
          MainStore.currentAddress = to.params.addressOrTopic;
          MainStore.currentLang = to.query.lang;
          routeApp(router);
        }
      }
    },
    {
      path: '/:address',
      name: 'address',
      component: App,
      beforeEnter: async (to, from) => {
        console.log('address route beforeEnter, to:', to, 'from:', from);
      }
    },
    {
      path: '/:topic',
      name: 'topic',
      component: App,
      beforeEnter: async (to, from) => {
        console.log('topic route beforeEnter, to:', to, 'from:', from);
      }
    },
    {
      path: '/:address/:topic',
      name: 'address-and-topic',
      component: App,
    },
    {
      path: '/:address/:topic/:data',
      name: 'address-topic-and-data',
      component: App,
    },
    {
      path: '/not-found',
      name: 'not-found',
      component: App,
    },
    {
      path: '/search',
      name: 'search',
      component: App,
      beforeEnter: async (to, from) => {
        const { address, lat, lng, lang } = to.query;
        if (import.meta.env.VITE_DEBUG == 'true') console.log('search route beforeEnter, to.query:', to.query, 'to:', to, 'from:', from, 'address:', address);
        const MainStore = useMainStore();
        if (MainStore.datafetchRunning) {
          return false;
        } else if (address && address !== '') {
          if (import.meta.env.VITE_DEBUG == 'true') console.log('search route beforeEnter, address:', address);
          MainStore.setLastSearchMethod('address');
          await getGeocodeAndPutInStore(address);
          routeApp(router);
        } else if (lat && lng) {
          MainStore.setLastSearchMethod('mapClick');
          await getParcelsAndPutInStore(lng, lat);
          routeApp(router);
        } else {
          return false;
        }
      },
    }
  ]
})

router.afterEach(async (to, from) => {
  const MainStore = useMainStore();
  if (import.meta.env.VITE_DEBUG == 'true') console.log('router afterEach to:', to, 'from:', from);
  // if (to.query.lang !== from.query.lang && to.path === from.path) {
  if (to.query.lang !== from.query.lang) {
    MainStore.currentLang = to.query.lang;
  // } else if (to.path === from.path) {
  //   return;
  }
  if (to.name === 'address-or-topic') {
    return;
  } else if (to.name !== 'not-found' && to.name !== 'search') {
    await dataFetch(to, from);
  } else if (to.name == 'not-found') {
    const MainStore = useMainStore();
    MainStore.currentTopic = "elections-and-ballots"
  }
});

export default router
