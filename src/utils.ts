import Config from "./config";
import { CategorySelection, SponsorTime } from "./types";

import * as CompileConfig from "../config.json";

class Utils {
    
    // Contains functions needed from the background script
    backgroundScriptContainer: any = null;

    // Used to add content scripts and CSS required
    js = [
        "./js/vendor.js",
        "./js/content.js"
    ];
    css = [
        "content.css",
        "./libs/Source+Sans+Pro.css",
        "popup.css"
    ];

    constructor(backgroundScriptContainer?: any) {
        this.backgroundScriptContainer = backgroundScriptContainer;
    }

    // Function that can be used to wait for a condition before returning
    async wait(condition, timeout = 5000, check = 100) { 
        return await new Promise((resolve, reject) => {
            setTimeout(() => reject("TIMEOUT"), timeout);

            let intervalCheck = () => {
                let result = condition();
                if (result !== false) {
                    resolve(result);
                    clearInterval(interval);
                };
            };

            let interval = setInterval(intervalCheck, check);
            
            //run the check once first, this speeds it up a lot
            intervalCheck();
        });
    }

    /**
     * Asks for the optional permissions required for all extra sites.
     * It also starts the content script registrations.
     * 
     * For now, it is just SB.config.invidiousInstances.
     * 
     * @param {CallableFunction} callback
     */
    setupExtraSitePermissions(callback) {
        // Request permission
        let permissions = ["declarativeContent"];
        if (this.isFirefox()) permissions = [];
        
        let self = this;

        chrome.permissions.request({
            origins: this.getInvidiousInstancesRegex(),
            permissions: permissions
        }, async function (granted) {
            if (granted) {
                self.setupExtraSiteContentScripts();
            } else {
                self.removeExtraSiteRegistration();
            }

            callback(granted);
        });
    }

    /**
     * Registers the content scripts for the extra sites.
     * Will use a different method depending on the browser.
     * This is called by setupExtraSitePermissions().
     * 
     * For now, it is just SB.config.invidiousInstances.
     */
    setupExtraSiteContentScripts() {
        let self = this;

        if (this.isFirefox()) {
            let firefoxJS = [];
            for (const file of this.js) {
                firefoxJS.push({file});
            }
            let firefoxCSS = [];
            for (const file of this.css) {
                firefoxCSS.push({file});
            }

            let registration = {
                message: "registerContentScript",
                id: "invidious",
                allFrames: true,
                js: firefoxJS,
                css: firefoxCSS,
                matches: this.getInvidiousInstancesRegex()
            };

            if (this.backgroundScriptContainer) {
                this.backgroundScriptContainer.registerFirefoxContentScript(registration);
            } else {
                chrome.runtime.sendMessage(registration);
            }
        } else {
            chrome.declarativeContent.onPageChanged.removeRules(["invidious"], function() {
                let conditions = [];
                for (const regex of self.getInvidiousInstancesRegex()) {
                    conditions.push(new chrome.declarativeContent.PageStateMatcher({
                        pageUrl: { urlMatches: regex }
                    }));
                }

                // Add page rule
                let rule = {
                    id: "invidious",
                    conditions,
                    // This API is experimental and not visible by the TypeScript compiler
                    actions: [new (<any> chrome.declarativeContent).RequestContentScript({
                        allFrames: true,
                        js: self.js,
                        css: self.css
                    })]
                };
                
                chrome.declarativeContent.onPageChanged.addRules([rule]);
            });
        }
    }

    /**
     * Removes the permission and content script registration.
     */
    removeExtraSiteRegistration() {
        if (this.isFirefox()) {
            let id = "invidious";

            if (this.backgroundScriptContainer) {
                this.backgroundScriptContainer.unregisterFirefoxContentScript(id);
            } else {
                chrome.runtime.sendMessage({
                    message: "unregisterContentScript",
                    id: id
                });
            }
        } else if (chrome.declarativeContent) {
            // Only if we have permission
            chrome.declarativeContent.onPageChanged.removeRules(["invidious"]);
        }

        chrome.permissions.remove({
            origins: this.getInvidiousInstancesRegex()
        });
    }

    /**
     * Gets just the timestamps from a sponsorTimes array
     * 
     * @param sponsorTimes 
     */
    getSegmentsFromSponsorTimes(sponsorTimes: SponsorTime[]): number[][] {
        let segments: number[][] = [];
        for (const sponsorTime of sponsorTimes) {
            segments.push(sponsorTime.segment);
        }

        return segments;
    }

    getSponsorIndexFromUUID(sponsorTimes: SponsorTime[], UUID: string): number {
        for (let i = 0; i < sponsorTimes.length; i++) {
            if (sponsorTimes[i].UUID === UUID) {
                return i;
            }
        }

        return -1;
    }

    getSponsorTimeFromUUID(sponsorTimes: SponsorTime[], UUID: string): SponsorTime {
        return sponsorTimes[this.getSponsorIndexFromUUID(sponsorTimes, UUID)];
    }

    getCategorySelection(category: string): CategorySelection {
        for (const selection of Config.config.categorySelections) {
            if (selection.name === category) {
                return selection;
            }
        }
    }

    localizeHtmlPage() {
        //Localize by replacing __MSG_***__ meta tags
        var objects = document.getElementsByClassName("sponsorBlockPageBody")[0].children;
        for (var j = 0; j < objects.length; j++) {
            var obj = objects[j];
            
            let localizedMessage = this.getLocalizedMessage(obj.innerHTML.toString());
            if (localizedMessage) obj.innerHTML = localizedMessage;
        }
    }

    getLocalizedMessage(text) {
        var valNewH = text.replace(/__MSG_(\w+)__/g, function(match, v1) {
            return v1 ? chrome.i18n.getMessage(v1) : "";
        });

        if(valNewH != text) {
            return valNewH;
        } else {
            return false;
        }
    }

    /**
     * @returns {String[]} Invidious Instances in regex form
     */
    getInvidiousInstancesRegex() {
        var invidiousInstancesRegex = [];
        for (const url of Config.config.invidiousInstances) {
            invidiousInstancesRegex.push("https://*." + url + "/*");
            invidiousInstancesRegex.push("http://*." + url + "/*");
        }

        return invidiousInstancesRegex;
    }

    generateUserID(length = 36) {
        let charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        if (window.crypto && window.crypto.getRandomValues) {
                let values = new Uint32Array(length);
                window.crypto.getRandomValues(values);
                for (let i = 0; i < length; i++) {
                        result += charset[values[i] % charset.length];
                }
                return result;
        } else {
                for (let i = 0; i < length; i++) {
                    result += charset[Math.floor(Math.random() * charset.length)];
                }
                return result;
        }
    }

    /**
     * Gets the error message in a nice string
     * 
     * @param {int} statusCode 
     * @returns {string} errorMessage
     */
    getErrorMessage(statusCode) {
        let errorMessage = "";
                            
        if([400, 429, 409, 502, 0].includes(statusCode)) {
            //treat them the same
            if (statusCode == 503) statusCode = 502;

            errorMessage = chrome.i18n.getMessage(statusCode + "") + " " + chrome.i18n.getMessage("errorCode") + statusCode
                            + "\n\n" + chrome.i18n.getMessage("statusReminder");
        } else {
            errorMessage = chrome.i18n.getMessage("connectionError") + statusCode;
        }

        return errorMessage;
    }

    /**
     * Sends a request to the SponsorBlock server with address added as a query
     * 
     * @param type The request type. "GET", "POST", etc.
     * @param address The address to add to the SponsorBlock server address
     * @param callback 
     */    
    async asyncRequestToServer(type: string, address: string, data = {}) {
        let serverAddress = Config.config.testingServer ? CompileConfig.testingServerAddress : Config.config.serverAddress;

        // If GET, convert JSON to parameters
        if (type.toLowerCase() === "get") {
            for (const key in data) {
                let seperator = address.includes("?") ? "&" : "?";
                let value = (typeof(data[key]) === "string") ? data[key]: JSON.stringify(data[key]);
                address += seperator + key + "=" + value;
            }

            data = null;
        }

        const response = await fetch(serverAddress + address, {
            method: type,
            headers: {
                'Content-Type': 'application/json'
            },
            redirect: 'follow',
            body: data ? JSON.stringify(data) : null
        });

        return response;
    }

    /**
     * Sends a request to the SponsorBlock server with address added as a query
     * 
     * @param type The request type. "GET", "POST", etc.
     * @param address The address to add to the SponsorBlock server address
     * @param callback 
     */
    sendRequestToServer(type: string, address: string, callback?: (xmlhttp: XMLHttpRequest, err: boolean) => any) {
        let xmlhttp = new XMLHttpRequest();

        let serverAddress = Config.config.testingServer ? CompileConfig.testingServerAddress : Config.config.serverAddress;
        
        xmlhttp.open(type, serverAddress + address, true);
  
        if (callback != undefined) {
            xmlhttp.onreadystatechange = function () {
                callback(xmlhttp, false);
            };
    
            xmlhttp.onerror = function(ev) {
                callback(xmlhttp, true);
            };
        }
  
        //submit this request
        xmlhttp.send();
    }

    getFormattedMinutes(seconds: number) {
        return Math.floor(seconds / 60);
    }

    getFormattedSeconds(seconds: number) {
        return seconds % 60;
    }

    getFormattedTime(seconds: number, precise?: boolean) {
        let minutes = Math.floor(seconds / 60);
        let secondsNum: number = seconds - minutes * 60;
        if (!precise) {
            secondsNum = Math.floor(secondsNum);
        }

        let secondsDisplay: string = String(secondsNum.toFixed(3));
        
        if (secondsNum < 10) {
            //add a zero
            secondsDisplay = "0" + secondsDisplay;
        }

        let formatted = minutes + ":" + secondsDisplay;

        return formatted;
    }

    getRawSeconds(minutes: number, seconds: number): number {
        return minutes * 60 + seconds;
    }

    /**
     * Is this Firefox (web-extensions)
     */
    isFirefox() {
        return typeof(browser) !== "undefined";
    }
}

export default Utils;