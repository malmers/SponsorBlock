import * as CompileConfig from "../config.json";
import { CategorySelection, CategorySkipOption } from "./types";

interface SBConfig {
    userID: string,
    sponsorTimes: SBMap<string, any>,
    whitelistedChannels: Array<any>,
    startSponsorKeybind: string,
    submitKeybind: string,
    minutesSaved: number,
    skipCount: number,
    sponsorTimesContributed: number,
    disableSkipping: boolean,
    trackViewCount: boolean,
    dontShowNotice: boolean,
    hideVideoPlayerControls: boolean,
    hideInfoButtonPlayerControls: boolean,
    hideDeleteButtonPlayerControls: boolean,
    hideUploadButtonPlayerControls: boolean,
    hideDiscordLaunches: number,
    hideDiscordLink: boolean,
    invidiousInstances: string[],
    autoUpvote: boolean,
    supportInvidious: boolean,
    serverAddress: string,
    minDuration: number,
    audioNotificationOnSkip,
    checkForUnlistedVideos: boolean,
    mobileUpdateShowCount: number,
    testingServer: boolean,

    // What categories should be skipped
    categorySelections: CategorySelection[]
}

interface SBObject {
    configListeners: Array<Function>;
    defaults: SBConfig;
    localConfig: SBConfig;
    config: SBConfig;

    // Functions
    encodeStoredItem<T>(data: T): T | Array<any>;
    convertJSON(): void;
}

// Allows a SBMap to be conveted into json form
// Currently used for local storage
class SBMap<T, U> extends Map {
    id: string;

    constructor(id: string, entries?: [T, U][]) {
        super();

        this.id = id;

        // Import all entries if they were given
        if (entries !== undefined) {
            for (const item of entries) {
                super.set(item[0], item[1])
            }
        }
    }

    set(key, value) {
        const result = super.set(key, value);

        // Store updated SBMap locally
        chrome.storage.sync.set({
            [this.id]: encodeStoredItem(this)
        });

        return result;
    }
	
    delete(key) {
        const result = super.delete(key);

	    // Store updated SBMap locally
	    chrome.storage.sync.set({
            [this.id]: encodeStoredItem(this)
        });

        return result;
    }

    clear() {
        const result = super.clear();

	    chrome.storage.sync.set({
            [this.id]: encodeStoredItem(this)
        });

        return result;
    }
}

var Config: SBObject = {
    /**
     * Callback function when an option is updated
     */
    configListeners: [],
    defaults: {
        userID: null,
        sponsorTimes: new SBMap("sponsorTimes"),
        whitelistedChannels: [],
        startSponsorKeybind: ";",
        submitKeybind: "'",
        minutesSaved: 0,
        skipCount: 0,
        sponsorTimesContributed: 0,
        disableSkipping: false,
        trackViewCount: true,
        dontShowNotice: false,
        hideVideoPlayerControls: false,
        hideInfoButtonPlayerControls: false,
        hideDeleteButtonPlayerControls: false,
        hideUploadButtonPlayerControls: false,
        hideDiscordLaunches: 0,
        hideDiscordLink: false,
        invidiousInstances: ["invidio.us", "invidiou.sh", "invidious.snopyta.org"],
        autoUpvote: true,
        supportInvidious: false,
        serverAddress: CompileConfig.serverAddress,
        minDuration: 0,
        audioNotificationOnSkip: false,
        checkForUnlistedVideos: false,
        mobileUpdateShowCount: 0,
        testingServer: false,

        categorySelections: [{
            name: "sponsor",
            option: CategorySkipOption.AutoSkip
        }]
    },
    localConfig: null,
    config: null,
    
    // Functions
    encodeStoredItem,
    convertJSON
};

// Function setup

/**
 * A SBMap cannot be stored in the chrome storage. 
 * This data will be encoded into an array instead
 * 
 * @param data 
 */
function encodeStoredItem<T>(data: T): T | Array<any>  {
    // if data is SBMap convert to json for storing
    if(!(data instanceof SBMap)) return data;
    return Array.from(data.entries());
}

/**
 * An SBMap cannot be stored in the chrome storage. 
 * This data will be decoded from the array it is stored in
 * 
 * @param {*} data 
 */
function decodeStoredItem<T>(id: string, data: T): T | SBMap<string, any> {
    if (!Config.defaults[id]) return data;

    if (Config.defaults[id] instanceof SBMap) {
        try {
            let jsonData: any = data;

            // Check if data is stored in the old format for SBMap (a JSON string)
            if (typeof data === "string") {
                try {	
                    jsonData = JSON.parse(data);	   
                } catch(e) {
                    // Continue normally (out of this if statement)
                }
            }

            if (!Array.isArray(jsonData)) return data;
            return new SBMap(id, jsonData);
        } catch(e) {
            console.error("Failed to parse SBMap: " + id);
        }
    }

    // If all else fails, return the data
    return data;
}

function configProxy(): any {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        for (const key in changes) {
            Config.localConfig[key] = decodeStoredItem(key, changes[key].newValue);
        }

        for (const callback of Config.configListeners) {
            callback(changes);
        }
    });
	
    var handler: ProxyHandler<any> = {
        set(obj, prop, value) {
            Config.localConfig[prop] = value;

            chrome.storage.sync.set({
                [prop]: encodeStoredItem(value)
            });

            return true;
        },

        get(obj, prop): any {
            let data = Config.localConfig[prop];

            return obj[prop] || data;
        },
	
        deleteProperty(obj, prop) {
            chrome.storage.sync.remove(<string> prop);
            
            return true;
        }

    };

    return new Proxy({handler}, handler);
}

function fetchConfig() { 
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(null, function(items) {
            Config.localConfig = <SBConfig> <unknown> items;  // Data is ready
            resolve();
        });
    });
}

function migrateOldFormats() {
    if (Config.config["disableAutoSkip"]) {
        for (const selection of Config.config.categorySelections) {
            if (selection.name === "sponsor") {
                selection.option = CategorySkipOption.ManualSkip;

                chrome.storage.sync.remove("disableAutoSkip");
            }
        }
    }
}

async function setupConfig() {
    await fetchConfig();
    addDefaults();
    convertJSON();
    Config.config = configProxy();
    migrateOldFormats();
}

// Reset config
function resetConfig() {
    Config.config = Config.defaults;
};

function convertJSON(): void {
    Object.keys(Config.localConfig).forEach(key => {
        Config.localConfig[key] = decodeStoredItem(key, Config.localConfig[key]);
    });
}

// Add defaults
function addDefaults() {
    for (const key in Config.defaults) {
        if(!Config.localConfig.hasOwnProperty(key)) {
	        Config.localConfig[key] = Config.defaults[key];
        }
    }
};

// Sync config
setupConfig();

export default Config;