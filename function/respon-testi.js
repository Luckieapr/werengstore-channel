const fs = require('fs');

function addResponTesti(key, response, isImage, image_url) {
  var obj_add = {
    key: key,
    response: response,
    isImage: isImage,
    image_url: image_url
  }
  db.data.testi.push(obj_add)
}

function getDataResponTesti(key) {
  let position = null
  Object.keys(db.data.testi).forEach((x) => {
    if (db.data.testi[x].key.toLowerCase() === key) {
      position = x
    }
  })
  if (position !== null) {
    return db.data.testi[position]
  }
}

function isAlreadyResponTesti(key) {
  let found = false
  Object.keys(db.data.testi).forEach((x) => {
    if (db.data.testi[x].key.toLowerCase() === key) {
      found = true
    }
  })
  return found
}

function sendResponTesti(key) {
  let position = null
  Object.keys(db.data.testi).forEach((x) => {
    if (db.data.testi[x].key.toLowerCase() === key) {
      position = x
    }
  })
  if (position !== null) {
    return db.data.testi[position].response
  }
}

function resetTestiAll(_db) {
  db.data.testi = {}
}

function delResponTesti(key) {
  let position = null
  for (let i of db.data.testi) {
    if (i.key.toLowerCase() === key) {
      position = i
    }
  }
  if (position !== null) {
    db.data.testi.splice(position, 1)
  }
}

function updateResponTesti(key, response, isImage, image_url) {
  let position = null
  Object.keys(db.data.testi).forEach((x) => {
    if (db.data.testi[x].key.toLowerCase() === key) {
      position = x
    }
  })
  if (position !== null) {
    db.data.testi[position].response = response
    db.data.testi[position].isImage = isImage
    db.data.testi[position].image_url = image_url
  }
}
module.exports = {
  addResponTesti,
  delResponTesti,
  resetTestiAll,
  isAlreadyResponTesti,
  sendResponTesti,
  updateResponTesti,
  getDataResponTesti
}
