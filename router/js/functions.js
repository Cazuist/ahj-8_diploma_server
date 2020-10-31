function getTypesAmounts(tasks) {
  const counts = {
    'message': 0,
    'coords': 0,
    'image': 0,
    'video': 0,
    'audio': 0,
    'file': 0,
    'audio_record': 0,
    'video_record': 0,
    'links': 0,
  }

  for (let key in counts) {    
    const typeAmount = tasks.filter((task) => task.type === key).length;
    counts[key] = typeAmount;  
  } 

  const messages = tasks.filter((task) => task.type === 'message');      
  const linksAmount = messages.filter((task) => task.content.includes('>http')).length; 
  counts['links'] = linksAmount;

  return counts;
}

module.exports = getTypesAmounts;
