const fs = require('fs')
const convert = require('xml-js')
const { capitalCase } = require('change-case')
console.log('Parsing WQX All Domain Values XML ...')

// parse xml for allowed values schemas
const xml = require('fs').readFileSync(__dirname + '/../All Domain Values.xml', 'utf8')
const values = JSON.parse(convert.xml2json(xml, { compact: true }))

const jsonSchema = {}
for (let e in values.WQXDomainValueList.WQXElement) {
  const field = values.WQXDomainValueList.WQXElement[e].WQXElementName._text
    .replace(/\s+/g, '')
    .replace(/\//g, '')
    .replace(/\(.*\)$/, '')

  const element = values.WQXDomainValueList.WQXElement[e].WQXElementRow

  jsonSchema[field] = {
    title: capitalCase(field),
    description: '',
    type: 'string',
    enum: [],
    maxLength: 0
  }
  let group = {}
  let required = {}
  let deprecated = []

  for (let r in element) {
    const row = element[r].WQXElementRowColumn || element[r]
    const rowObj = {}

    // re-org
    for (let c in row) {
      const col = row[c]._attributes

      if (col.colname === 'DomainValueStatus') {
        col.value = col.value === 'Accepted'
      }

      if (col.colname.includes('Required')) {
        col.colname = col.colname.replace('Required', '')
        col.value = col.value === 'Y'

        if (!required[col.colname]) {
          required[col.colname] = {
            'if': {
              'properties': {
                [field]: { 'enum': [] }
              },
              'required': [field]
            },
            'then': {
              'required': [col.colname]
            }
          }
        }
      }

      rowObj[col.colname] = col.value
    }

    // enum values
    let value = ''
    if (Object.keys(rowObj).includes('ID')) {
      value = rowObj['ID']
    } else if (Object.keys(rowObj).includes('Characteristic')) {  // CharacteristicPickListValue
      value = rowObj['Characteristic']
    } else if (Object.keys(rowObj).includes('Code')) {
      value = rowObj['Code']
    } else if (Object.keys(rowObj).includes('CountyFIPSCode')) {  // County
      value = rowObj['CountyName'] + ', ' + rowObj['StateCode']
    } else {
      value = rowObj['Name'] || rowObj['AliasName']
    }

    if (!value) {
      console.log(JSON.stringify(element[r], null, 2), rowObj)
    }

    // deprecated value
    if (Object.keys(rowObj).includes('DomainValueStatus') && !rowObj['DomainValueStatus']) {
      deprecated.push(value)
    }

    // Groups
    // Characteristic => GroupName
    if (Object.keys(rowObj).includes('GroupName') ) {
      group[value] = rowObj['GroupName']
    }

    // Required
    Object.keys(required).forEach(col => {
      // TODO optimization, split into permutations A,B,A*B
      required[col].if.properties[field].enum.push(value)
    })

    jsonSchema[field].maxLength = Math.max(jsonSchema[field].maxLength, value.length)
    if (jsonSchema[field].enum.includes(value)) {
      if (!field.includes('Alias')) console.log(`duplicate found in ${field}`, value)
    } else {
      jsonSchema[field].enum.push(value)
    }
  }

  console.log('Save', field)
  fs.writeFileSync(__dirname + `/../src/values/${field}.json`, JSON.stringify(jsonSchema[field], null, 2), 'utf8')

  if (deprecated.length) {
    fs.writeFileSync(__dirname + `/../src/deprecated/${field}.json`, JSON.stringify(deprecated, null, 2), 'utf8')
  }
  if (Object.keys(group).length) {
    fs.writeFileSync(__dirname + `/../src/groups/${field}.json`, JSON.stringify(group, null, 2), 'utf8')
  }
  Object.keys(required).forEach(col => {
    console.log('>', col)
    fs.writeFileSync(__dirname + `/../src/required/${field}-${col}.json`, JSON.stringify(required[col], null, 2), 'utf8')
  })
}

//fs.writeFileSync(__dirname+'/../src/definitions.values.json', JSON.stringify(jsonSchema, null, 2), 'utf8');
console.log('Done!')
