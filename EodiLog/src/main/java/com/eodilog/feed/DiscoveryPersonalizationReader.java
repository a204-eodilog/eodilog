package com.eodilog.feed;
import com.eodilog.place.service.PlaceReader;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.namedparam.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.*;
@Component @RequiredArgsConstructor @Transactional(readOnly=true)
public class DiscoveryPersonalizationReader {
 private final NamedParameterJdbcTemplate jdbc;private final FeedRepository feeds;private final FeedExposureService exposure;private final PlaceReader places;private final JsonMapper json;private final Clock clock;
 private MapSqlParameterSource params(UUID viewer){return new MapSqlParameterSource("viewer",viewer).addValue("since",Timestamp.from(Instant.EPOCH)).addValue("now",Timestamp.from(clock.instant()));}
 public ObjectNode input(UUID viewer,List<DiscoveryItem> selected){
  var out=json.createObjectNode().put("limit",selected.size());var liked=out.putArray("liked");var candidates=out.putArray("candidates");
  var rows=jdbc.query("select f.* from feeds f join trips t on t.id=f.trip_id where "+DiscoveryRepository.ALLOWED+" and exists(select 1 from feed_likes l where l.feed_id=f.id and l.user_id=:viewer) order by f.published_at desc,f.id desc limit 200",params(viewer),feeds::map);
  for(var card:exposure.toCards(viewer,rows))liked.add(feed(card));
  // Recheck candidate access before constructing the AI payload as well as after HTTP.
  for(var item:current(viewer,selected))candidates.add(item.type()==DiscoveryItem.Type.FEED?feed(item.feed()):place(item.place().id()));return out;
 }
 private ObjectNode feed(FeedDtos.FeedCard card){
  var n=entry("FEED",card.id());n.put("regionName",card.regions().isEmpty()?null:card.regions().getFirst().name());var categories=n.putArray("placeCategories");
  jdbc.query("select distinct p.category from feed_places fp join places p on p.id=fp.place_id where fp.feed_id=:id and p.category is not null order by p.category",new MapSqlParameterSource("id",card.id()),(org.springframework.jdbc.core.RowCallbackHandler)r->categories.add(r.getString(1)));return n;
 }
 private ObjectNode place(UUID id){var n=entry("PLACE",id);jdbc.query("select r.name,p.category from places p left join regions r on r.id=p.region_id where p.id=:id",new MapSqlParameterSource("id",id),(org.springframework.jdbc.core.RowCallbackHandler)r->{n.put("regionName",r.getString(1));if(r.getString(2)!=null)n.withArray("placeCategories").add(r.getString(2));});return n;}
 private ObjectNode entry(String type,UUID id){var n=json.createObjectNode().put("type",type).put("id",id.toString());n.putNull("regionName");n.putArray("tags");n.putArray("placeCategories");return n;}
 public List<DiscoveryItem> current(UUID viewer,List<DiscoveryItem> selected){
  List<UUID> feedIds=selected.stream().filter(i->i.type()==DiscoveryItem.Type.FEED).map(i->i.feed().id()).toList();List<UUID> placeIds=selected.stream().filter(i->i.type()==DiscoveryItem.Type.PLACE).map(i->i.place().id()).toList();
  Map<UUID,FeedDtos.FeedCard> cards=new HashMap<>();
  if(!feedIds.isEmpty()){var p=params(viewer).addValue("ids",feedIds);var rows=jdbc.query("select f.* from feeds f join trips t on t.id=f.trip_id where "+DiscoveryRepository.ALLOWED+" and f.id in (:ids)",p,feeds::map);exposure.toCards(viewer,rows).forEach(c->cards.put(c.id(),c));}
  Set<UUID> allowedPlaces=placeIds.isEmpty()?Set.of():new HashSet<>(jdbc.queryForList("select distinct fp.place_id from feed_places fp join feeds f on f.id=fp.feed_id join trips t on t.id=f.trip_id where "+DiscoveryRepository.ALLOWED+" and fp.place_id in (:ids)",params(viewer).addValue("ids",placeIds),UUID.class));
  var placeViews=places.findAll(allowedPlaces);List<DiscoveryItem> out=new ArrayList<>();for(var i:selected){if(i.type()==DiscoveryItem.Type.FEED&&cards.containsKey(i.feed().id()))out.add(new DiscoveryItem(i.type(),cards.get(i.feed().id()),null,i.reason()));else if(i.type()==DiscoveryItem.Type.PLACE&&placeViews.containsKey(i.place().id()))out.add(new DiscoveryItem(i.type(),null,placeViews.get(i.place().id()),i.reason()));}return out;
 }
}
