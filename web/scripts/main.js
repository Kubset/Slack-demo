/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

class Room {
    constructor(room) {
        this.room = room;
        document.getElementById('currentChannel').innerHTML = '# ' + room;
    }

    setRoom(room) {
        document.getElementById('currentChannel').innerHTML = '# ' + room;
        this.room = room;
    }

    getRoom() {
        return this.room;
    }
}

const room = new Room('general');

// Signs-in Friendly Chat.
function signIn() {
    // Sign in Firebase using popup auth and Google as the identity provider.
    var provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider);
}

// Signs-out of Friendly Chat.
function signOut() {
    // Sign out of Firebase.
    firebase.auth().signOut();
}

// Initiate firebase auth.
function initFirebaseAuth() {
    // Listen to auth state changes.
    firebase.auth().onAuthStateChanged(authStateObserver);
}

// Returns the signed-in user's profile Pic URL.
function getProfilePicUrl() {
    return firebase.auth().currentUser.photoURL || '/images/profile_placeholder.png';
}

// Returns the signed-in user's display name.
function getUserName() {
    return firebase.auth().currentUser;
}

// Returns true if a user is signed-in.
function isUserSignedIn() {
    return !!firebase.auth().currentUser;
}

function loadMessages() {
    // TODO 7: Load and listens for new messages.
    var messages = document.getElementById('messages');
    messages.innerHTML = `<span id="message-filler"></span>`;
    var callback = function(snap) {
        var data = snap.val();
        displayMessage(snap.key, data.name, data.text, data.profilePicUrl, data.imageUrl, data.timestamp);
    };

    firebase.database().ref('/messages/' + room.getRoom() + '').limitToLast(30).on('child_added', callback);
    firebase.database().ref('/messages/' + room.getRoom() + '').limitToLast(30).on('child_changed', callback);
}

function loadUsers() {
    var users = document.getElementById('users');
    // users.innerHTML = `<span id="message-filler"></span>`;
    var callback = function(snap) {
        var data = snap.val();
        displayUser(data.name, data.profilePicUrl, data.online);
    };
    firebase.database().ref('/users/').on('child_changed', callback);
    firebase.database().ref('/users/').on('child_added', callback);
}

// Saves a new message on the Firebase DB.
function saveMessage(messageText) {
    // TODO 8: Push a new message to Firebase.
    return firebase.database().ref('/messages/' + room.getRoom() + '').push({
        name: getUserName().displayName,
        text: messageText,
        timestamp: moment(new Date()).unix(),
        profilePicUrl: getProfilePicUrl()
    }).catch(function(error) {
        // console.error('Error writing new message to Firebase Database', error);
    });
}

// Saves a new message containing an image in Firebase.
// This first saves the image in Firebase storage.
function saveImageMessage(file) {
    // TODO 9: Posts a new image as a message.
    firebase.database().ref('/messages/' + room.getRoom() + '').push({
        name: getUserName().displayName,
        imageUrl: LOADING_IMAGE_URL,
        profilePicUrl: getProfilePicUrl()
    }).then(function(messageRef) {
        // 2 - Upload the image to Cloud Storage.
        var filePath = firebase.auth().currentUser.uid + '/' + messageRef.key + '/' + file.name;
        return firebase.storage().ref(filePath).put(file).then(function(fileSnapshot) {
            // 3 - Generate a public URL for the file.
            return fileSnapshot.ref.getDownloadURL().then((url) => {
                // 4 - Update the chat message placeholder with the image's URL.
                return messageRef.update({
                    imageUrl: url,
                    storageUri: fileSnapshot.metadata.fullPath
                });
            });
        });
    }).catch(function(error) {
        // console.error('There was an error uploading a file to Cloud Storage:', error);
    });
}

// Saves the messaging device token to the datastore.
function saveMessagingDeviceToken() {
    firebase.messaging().getToken().then(function(currentToken) {
        if (currentToken) {
            // console.log('Got FCM device token:', currentToken);
            // Saving the Device Token to the datastore.
            firebase.database().ref('/fcmTokens').child(currentToken)
                .set(firebase.auth().currentUser.uid);
        } else {
            // Need to request permissions to show notifications.
            requestNotificationsPermissions();
        }
    }).catch(function(error) {
        // console.error('Unable to get messaging token.', error);
    });
}

function listenOnlineUsers() {
    var user = getUserName().uid;
    var presenceRef = firebase.database().ref('/users/' + user).onDisconnect().update({
        online: false
    });
}

function saveUserToDb() {

    var user = firebase.auth().currentUser;
    var userRef = firebase.database().ref('/users/' + user.uid + '/');
    userRef.transaction(function(currentData) {
        if (currentData === null) {
            return { name: user.displayName, profilePicUrl: getProfilePicUrl(), online: true };
        } else {
            return { name: user.displayName, profilePicUrl: getProfilePicUrl(), online: true };
            // console.log('User already exists.');
            return; // Abort the transaction.
        }
    }, function(error, committed, snapshot) {
        if (error) {
            // console.log('Transaction failed abnormally!', error);
        } else if (!committed) {
            // console.log('We aborted the transaction (because user already exists).');
        } else {
            // console.log('User added!');
        }
        // console.log("User's data: ", snapshot.val());
    });
}

// Requests permissions to show notifications.
function requestNotificationsPermissions() {
    console.log('Requesting notifications permission...');
    firebase.messaging().requestPermission().then(function() {
        // Notification permission granted.
        saveMessagingDeviceToken();
    }).catch(function(error) {
        console.error('Unable to get permission to notify.', error);
    });
}

// Triggered when a file is selected via the media picker.
function onMediaFileSelected(event) {
    event.preventDefault();
    var file = event.target.files[0];

    // Clear the selection in the file picker input.
    imageFormElement.reset();

    // Check if the file is an image.
    if (!file.type.match('image.*')) {
        var data = {
            message: 'You can only share images',
            timeout: 2000
        };
        M.toast({ html: data });
        // signInSnackbarElement.MaterialSnackbar.showSnackbar(data);
        return;
    }
    // Check if the user is signed-in
    if (checkSignedInWithMessage()) {
        saveImageMessage(file);
    }
}

// Triggered when the send new message form is submitted.
function onMessageFormSubmit(e) {
    e.preventDefault();
    // Check that the user entered a message and is signed in.
    if (messageInputElement.value && checkSignedInWithMessage()) {
        saveMessage(messageInputElement.value).then(function() {
            // Clear message text field and re-enable the SEND button.
            // resetMaterialTextfield(messageInputElement);
            messageInputElement.value = "";
            window.scrollTo(0, document.body.scrollHeight);
            toggleButton();
        });
    }
}

// Triggers when the auth state change for instance when the user signs-in or signs-out.
function authStateObserver(user) {
    if (user) { // User is signed in!
        // Get the signed-in user's profile pic and name.
        var profilePicUrl = getProfilePicUrl();
        var userName = getUserName().displayName;

        // Set the user's profile pic and name.
        userPicElement.style.backgroundImage = 'url(' + profilePicUrl + ')';
        userNameElement.textContent = userName;

        // Show user's profile and sign-out button.
        userNameElement.classList.remove('hidden');
        userPicElement.classList.remove('hidden');
        signOutButtonElement.classList.remove('hidden');

        // Hide sign-in button.
        signInButtonElement.classList.add('hidden');

        // We save the Firebase Messaging Device token and enable notifications.
        saveMessagingDeviceToken();
        saveUserToDb();
    } else { // User is signed out!
        // Hide user's profile and sign-out button.
        userNameElement.classList.add('hidden');
        userPicElement.classList.add('hidden');
        signOutButtonElement.classList.add('hidden');

        // Show sign-in button.
        signInButtonElement.classList.remove('hidden');
    }
}

// Returns true if user is signed-in. Otherwise false and displays a message.
function checkSignedInWithMessage() {
    // Return true if the user is signed in Firebase
    if (isUserSignedIn()) {
        return true;
    }

    // Display a message to the user using a Toast.
    var data = {
        message: 'You must sign-in first',
        timeout: 2000
    };

    // signInSnackbarElement.MaterialSnackbar.showSnackbar(data);
    M.toast({ html: data.message });
    return false;
}

var MESSAGE_TEMPLATE = `<div class="flex flex-row message-container">
                    <div class="mr-5 avatar"><img class="pic" src="" alt="avatar"></div>
                    <div class="flex flex-column">
                        <div class="flex flex-row">
                            <div class="signature mr-5"><span class="name"></span></div>
                            <div class="signature date"><span class="timestamp"></span></div>
                        </div>
                        <div>
                            <p class="message"><span class="message"></span></p>
                        </div>
                    </div>
                </div>`;

// A loading image URL.
var LOADING_IMAGE_URL = 'https://www.google.com/images/spin-32.gif?a';

// Displays a Message in the UI.
function displayMessage(key, name, text, picUrl, imageUrl, timestamp) {
    var div = document.getElementById(key);
    // If an element for that message does not exists yet we create it.
    if (!div) {
        var container = document.createElement('div');
        container.innerHTML = MESSAGE_TEMPLATE;
        div = container.firstChild;
        div.setAttribute('id', key);
        messageListElement.appendChild(div);
    }
    if (picUrl) {
        div.querySelector('.pic').src = picUrl;
    }
    if (timestamp) {
        var readableDate = moment.unix(timestamp).format('YYYY-MM-DD HH:mm:ss');
        div.querySelector('.timestamp').textContent = readableDate;
    }
    div.querySelector('.name').textContent = name;
    var messageElement = div.querySelector('.message');
    if (text) { // If the message is text.
        messageElement.textContent = text;
        // Replace all line breaks by <br>.
        messageElement.innerHTML = messageElement.innerHTML.replace(/\n/g, '<br>');
    } else if (imageUrl) { // If the message is an image.
        var image = document.createElement('img');
        image.addEventListener('load', function() {
            messageListElement.scrollTop = messageListElement.scrollHeight;
        });
        image.src = imageUrl + '&' + new Date().getTime();
        messageElement.innerHTML = '';
        messageElement.appendChild(image);
    }
    // Show the card fading-in and scroll to view the new message.
    setTimeout(function() { div.classList.add('visible') }, 1);
    messageListElement.scrollTop = messageListElement.scrollHeight;
    messageInputElement.focus();
}

var USER_TEMPLATE = `<img src="" alt="" class="pic avatar">
                        <span class="title"></span>
                        <span id="online"></span>`;

// Displays a User in the UI.
function displayUser(name, picUrl, online) {
    console.log(name, picUrl, online);
    var div = document.getElementById('users');
    var container = document.createElement('li');
    container.classList.add('collection-item');
    container.innerHTML = USER_TEMPLATE;
    // container.setAttribute('id', name);
    userListElement.appendChild(container);
    if (name) {
        div.querySelector('.title').innerHTML = name;
    }
    if (picUrl) {
        div.querySelector('.pic').src = picUrl;
    }
    if (online == true) {
        div.querySelector('#online').innerHTML = `<span class="badge">Online</span>`;
    } else if (online == false) {
        div.querySelector('#online').innerHTML = `<span class="red badge">Offline</span>`;
    } else {
        div.querySelector('#online').innerHTML = `<span class="red badge">Offline</span>`;
    }
    setTimeout(function() { div.classList.add('visible') }, 1);
}

// Enables or disables the submit button depending on the values of the input
// fields.
function toggleButton() {
    if (messageInputElement.value) {
        submitButtonElement.removeAttribute('disabled');
    } else {
        submitButtonElement.setAttribute('disabled', 'true');
    }
}

// Checks that the Firebase SDK has been correctly setup and configured.
function checkSetup() {
    if (!window.firebase || !(firebase.app instanceof Function) || !firebase.app().options) {
        window.alert('You have not configured and imported the Firebase SDK. ' +
            'Make sure you go through the codelab setup instructions and make ' +
            'sure you are running the codelab using `firebase serve`');
    }
}

// Checks that Firebase has been imported.
checkSetup();

// Shortcuts to DOM Elements.
var userListElement = document.getElementById('users');
var messageListElement = document.getElementById('messages');
var messageFormElement = document.getElementById('message-form');
var messageInputElement = document.getElementById('message');
var submitButtonElement = document.getElementById('submit');
var imageButtonElement = document.getElementById('submitImage');
var imageFormElement = document.getElementById('image-form');
var mediaCaptureElement = document.getElementById('mediaCapture');
var userPicElement = document.getElementById('user-pic');
var userNameElement = document.getElementById('user-name');
var signInButtonElement = document.getElementById('sign-in');
var signOutButtonElement = document.getElementById('sign-out');
var signInSnackbarElement = document.getElementById('must-signin-snackbar');

// Saves message on form submit.
messageFormElement.addEventListener('submit', onMessageFormSubmit);
signOutButtonElement.addEventListener('click', signOut);
signInButtonElement.addEventListener('click', signIn);

// Toggle for the button.
messageInputElement.addEventListener('keyup', toggleButton);
messageInputElement.addEventListener('change', toggleButton);

// Events for image upload.
imageButtonElement.addEventListener('click', function(e) {
    e.preventDefault();
    mediaCaptureElement.click();
});
mediaCaptureElement.addEventListener('change', onMediaFileSelected);

// initialize Firebase
initFirebaseAuth();

loadMessages();

setTimeout(() => {
    listenOnlineUsers();
}, 1000);
setTimeout(() => {
    loadUsers();
}, 1000);