package io.terrakube.api.schema;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

import graphql.introspection.IntrospectionQuery;
import graphql.introspection.IntrospectionResultToSchema;
import graphql.language.Document;
import graphql.schema.GraphQLNamedSchemaElement;
import graphql.schema.GraphQLSchema;
import graphql.schema.GraphQLSchemaElement;
import graphql.schema.GraphqlTypeComparatorEnvironment;
import graphql.schema.GraphqlTypeComparatorRegistry;
import graphql.schema.idl.SchemaParser;
import graphql.schema.idl.SchemaPrinter;
import graphql.schema.idl.UnExecutableSchemaGenerator;
import io.restassured.response.Response;
import io.terrakube.api.PostgresServerApplicationTests;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Exports the Elide GraphQL schema the UI's GraphQL documents are typed against and fails when it drifts from the
 * committed SDL, so an entity change can't land without regenerating it.
 */
class GraphqlSchemaExportTest extends PostgresServerApplicationTests {

    private static final Path COMMITTED =
            Path.of("..", "ui", "src", "domain", "generated", "graphql", "schema.graphql");
    private static final String UPDATE_FLAG = "api.graphql.update";

    // Elide orders types and fields differently on every boot, so only a name order gives a stable file.
    private static final GraphqlTypeComparatorRegistry BY_NAME = new GraphqlTypeComparatorRegistry() {
        @Override
        public <T extends GraphQLSchemaElement> Comparator<? super T> getComparator(
                GraphqlTypeComparatorEnvironment environment) {
            return Comparator.comparing(element -> ((GraphQLNamedSchemaElement) element).getName());
        }
    };

    // Clients build these in, so they are left out; graphql-java's own list also counts the server's experimental
    // directives, which clients don't know.
    private static final Set<String> SPECIFIED_DIRECTIVES =
            Set.of("deprecated", "include", "oneOf", "skip", "specifiedBy");

    private Map<String, Object> introspection;
    private String sdl;

    @BeforeAll
    void exportSchema() {
        // Elide's QueryRunner keeps its GraphQL instance private, so the schema is read the way a client would.
        Response response = given()
                .headers("Authorization", "Bearer " + generatePAT("TERRAKUBE_ADMIN"),
                        "Content-Type", "application/json")
                .body(Map.of("query", IntrospectionQuery.INTROSPECTION_QUERY))
                .post("/graphql/api/v1");
        assertThat(response.jsonPath().getList("errors")).as(response.asPrettyString()).isNull();
        introspection = response.jsonPath().getMap("data");
        sdl = print(introspection);
    }

    @Test
    void graphqlSchemaMatchesCommitted() throws IOException {
        if (Boolean.getBoolean(UPDATE_FLAG)) {
            Files.createDirectories(COMMITTED.getParent());
            Files.writeString(COMMITTED, sdl, StandardCharsets.UTF_8);
            return;
        }
        String committed = Files.exists(COMMITTED) ? Files.readString(COMMITTED, StandardCharsets.UTF_8) : "";
        assertThat(sdl)
                .as("%s is stale; regenerate it with mvn test -Dtest=GraphqlSchemaExportTest -D%s=true",
                        COMMITTED.normalize(), UPDATE_FLAG)
                .isEqualTo(committed);
    }

    @Test
    void printingIsDeterministic() {
        assertThat(print(introspection)).isEqualTo(sdl);
    }

    private static String print(Map<String, Object> introspection) {
        Document definition = new IntrospectionResultToSchema().createSchemaDefinition(introspection);
        GraphQLSchema schema =
                UnExecutableSchemaGenerator.makeUnExecutableSchema(new SchemaParser().buildRegistry(definition));
        SchemaPrinter.Options options = SchemaPrinter.Options.defaultOptions()
                .includeDirectiveDefinition(name -> !SPECIFIED_DIRECTIVES.contains(name))
                .setComparators(BY_NAME);
        String printed = new SchemaPrinter(options).print(schema);
        return printed.strip() + "\n";
    }
}
