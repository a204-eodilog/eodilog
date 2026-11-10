package com.eodilog.feed;
import com.eodilog.global.ai.*;
import com.eodilog.global.common.response.PageResponse;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
/** AI only reorders within the already selected keyset page. Unranked items follow in rule order.
 * The cursor always advances over the original page, so AI cannot move items across page boundaries.
 * All DB work lives in DiscoveryPageReader/DiscoveryPersonalizationReader; no transaction crosses HTTP. */
@Service @RequiredArgsConstructor
public class DiscoveryService {
 static final int WINDOW_DAYS=30;
 private final DiscoveryPageReader pages;private final DiscoveryPersonalizationReader reader;private final AiServerClient ai;private final JsonMapper json;
 public PageResponse<DiscoveryItem> recommendations(UUID viewer,String cursor,int limit){
  var baseline=pages.recommendations(viewer,cursor,limit);
  if(baseline.data().isEmpty())return baseline;
  var input=reader.input(viewer,baseline.data());List<DiscoveryItem> ordered=baseline.data();
  if(!input.path("liked").isEmpty()&&!input.path("candidates").isEmpty()) {
   try{Set<String> allowed=new HashSet<>();input.path("candidates").forEach(n->allowed.add(n.path("type").asString()+":"+n.path("id").asString()));ordered=rank(ai.post("/ai/v1/discovery-recommendations",UUID.randomUUID(),input),baseline.data().stream().filter(i->allowed.contains(key(i))).toList());}
   catch(RuntimeException ignored){ordered=baseline.data();}
  }
  var current=reader.current(viewer,ordered);
  return PageResponse.of(current,baseline.page().nextCursor(),baseline.page().hasNext());
 }
 List<DiscoveryItem> rank(JsonNode response,List<DiscoveryItem> baseline){
  if(!response.isObject()||!response.path("items").isArray()||response.path("items").size()>baseline.size())throw new IllegalArgumentException();
  Map<String,DiscoveryItem> candidates=new LinkedHashMap<>();baseline.forEach(i->candidates.put(key(i),i));List<DiscoveryItem> out=new ArrayList<>();
  for(var n:response.path("items")){
   String type=n.path("type").asString();String field=type.equals("FEED")?"feedId":type.equals("PLACE")?"placeId":null;
   if(field==null||!n.path(field).isString()||!n.path(type.equals("FEED")?"placeId":"feedId").isNull()||!n.path("reason").isString()||n.path("reason").asString().isBlank()||n.path("reason").asString().length()>1000)throw new IllegalArgumentException();
   var original=candidates.remove(type+":"+n.path(field).asString());if(original==null)throw new IllegalArgumentException();
   out.add(new DiscoveryItem(original.type(),original.feed(),original.place(),n.path("reason").asString()));
  }
  out.addAll(candidates.values());return out;
 }
 static String key(DiscoveryItem i){return i.type()+":"+(i.type()==DiscoveryItem.Type.FEED?i.feed().id():i.place().id());}
}
